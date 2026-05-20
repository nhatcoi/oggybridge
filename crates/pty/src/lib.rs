use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;

pub struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
}

// SAFETY: MasterPty impls are Send; Mutex makes them Sync.
unsafe impl Sync for PtySession {}

impl PtySession {
    pub fn spawn<F>(cols: u16, rows: u16, cmd: &str, on_data: F) -> anyhow::Result<Self>
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
        builder.env("TERM", "xterm-256color");
        builder.env("COLORTERM", "truecolor");

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
