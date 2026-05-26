use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::BTreeSet;
use std::env;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command as ProcessCommand;
use std::sync::Mutex;
use std::sync::OnceLock;

pub struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
}

// SAFETY: MasterPty impls are Send; Mutex makes them Sync.
unsafe impl Sync for PtySession {}

static AUGMENTED_PATH: OnceLock<String> = OnceLock::new();

fn login_shell_path() -> Option<String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| {
        #[cfg(windows)]
        {
            "cmd".to_string()
        }
        #[cfg(not(windows))]
        {
            "/bin/zsh".to_string()
        }
    });

    #[cfg(windows)]
    let output = ProcessCommand::new(shell)
        .args(["/C", "echo %PATH%"])
        .output()
        .ok()?;

    #[cfg(not(windows))]
    let output = ProcessCommand::new(shell)
        .args(["-lc", "printf %s \"$PATH\""])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}

fn common_tool_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/local/sbin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/usr/sbin"),
        PathBuf::from("/sbin"),
    ];

    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        dirs.extend([
            home.join(".cargo/bin"),
            home.join(".local/bin"),
            home.join(".npm-global/bin"),
            home.join(".bun/bin"),
            home.join(".deno/bin"),
        ]);
    }

    dirs
}

fn augmented_path() -> &'static str {
    AUGMENTED_PATH.get_or_init(|| {
        let mut seen = BTreeSet::new();
        let mut paths = Vec::new();

        for path_value in [env::var_os("PATH"), login_shell_path().map(Into::into)] {
            if let Some(path_value) = path_value {
                for path in env::split_paths(&path_value) {
                    if seen.insert(path.clone()) {
                        paths.push(path);
                    }
                }
            }
        }

        for path in common_tool_dirs() {
            if seen.insert(path.clone()) {
                paths.push(path);
            }
        }

        env::join_paths(paths)
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    })
}

impl PtySession {
    pub fn spawn<F>(
        cols: u16,
        rows: u16,
        cmd: &str,
        args: &[String],
        cwd: Option<&std::path::Path>,
        on_data: F,
    ) -> anyhow::Result<Self>
    where
        F: Fn(String) + Send + 'static,
    {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut builder = CommandBuilder::new(cmd);
        builder.args(args);
        builder.env("TERM", "xterm-256color");
        builder.env("COLORTERM", "truecolor");
        builder.env("PATH", augmented_path());
        if let Some(dir) = cwd {
            builder.cwd(dir);
        }

        let _child = pair.slave.spawn_command(builder)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => on_data(String::from_utf8_lossy(&buf[..n]).to_string()),
                }
            }
        });

        Ok(Self {
            writer: Mutex::new(writer),
            master: Mutex::new(pair.master),
        })
    }

    pub fn write(&self, data: &[u8]) -> anyhow::Result<()> {
        self.writer.lock().unwrap().write_all(data)?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> anyhow::Result<()> {
        self.master.lock().unwrap().resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }
}
