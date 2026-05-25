// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        match args[1].as_str() {
            "--help" | "-h" | "help" => {
                println!("OggyBridge v{VERSION}");
                println!("Multi-agent AI coding workspace\n");
                println!("USAGE:");
                println!("  oggybridge              Launch the app");
                println!("  oggybridge --help       Show this help");
                println!("  oggybridge --version    Show version");
                println!("  oggybridge --update     Check and install latest release");
                println!("  oggybridge --uninstall  Remove OggyBridge from this machine");
                return;
            }
            "--version" | "-v" | "version" => {
                println!("oggybridge {VERSION}");
                return;
            }
            "--update" | "update" => {
                cli_update();
                return;
            }
            "--uninstall" | "uninstall" => {
                cli_uninstall();
                return;
            }
            unknown => {
                eprintln!("Unknown command: {unknown}");
                eprintln!("Run `oggybridge --help` for usage.");
                std::process::exit(1);
            }
        }
    }
    oggybridge_lib::run()
}

fn cli_update() {
    println!("OggyBridge v{VERSION} — checking for updates...");

    let output = std::process::Command::new("curl")
        .args(["-sf", "https://api.github.com/repos/nhatcoi/oggybridge/releases/latest",
               "-H", "User-Agent: oggybridge-cli"])
        .output();

    let body = match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => { eprintln!("Failed to fetch release info. Check your internet connection."); return; }
    };

    // Extract tag_name from JSON (no serde dep — simple string search)
    let latest = extract_json_str(&body, "tag_name")
        .map(|t| t.trim_start_matches('v').to_string());

    match latest {
        None => { eprintln!("Could not parse release info."); return; }
        Some(ref v) if v == VERSION => { println!("Already up to date (v{VERSION})."); return; }
        Some(ref v) => println!("New version available: v{v}. Installing..."),
    }

    let latest = latest.unwrap();

    #[cfg(target_os = "linux")]
    {
        let url = format!(
            "https://github.com/nhatcoi/oggybridge/releases/download/v{latest}/OggyBridge_{latest}_amd64.deb"
        );
        let deb = format!("/tmp/OggyBridge_{latest}_amd64.deb");
        println!("Downloading {url}");
        let dl = std::process::Command::new("curl")
            .args(["-L", "-o", &deb, &url]).status();
        if dl.map(|s| s.success()).unwrap_or(false) {
            let install = std::process::Command::new("sudo")
                .args(["dpkg", "-i", &deb]).status();
            match install {
                Ok(s) if s.success() => println!("Updated to v{latest}. Run `oggybridge` to launch."),
                _ => eprintln!("Install failed. Run manually: sudo dpkg -i {deb}"),
            }
        } else {
            eprintln!("Download failed.");
        }
    }

    #[cfg(target_os = "macos")]
    {
        println!("macOS: run the installer to update:");
        println!("  curl -fsSL https://raw.githubusercontent.com/nhatcoi/oggybridge/main/install.sh | bash");
    }
}

fn cli_uninstall() {
    println!("Uninstalling OggyBridge...");

    #[cfg(target_os = "linux")]
    {
        let st = std::process::Command::new("sudo")
            .args(["dpkg", "-r", "oggy-bridge"]).status();
        match st {
            Ok(s) if s.success() => println!("Removed oggy-bridge package."),
            _ => eprintln!("dpkg remove failed. Try: sudo dpkg -r oggy-bridge"),
        }
        // Remove AppImage if present
        let appimage = format!("{}/.local/bin/oggybridge",
            std::env::var("HOME").unwrap_or_default());
        if std::path::Path::new(&appimage).exists() {
            let _ = std::fs::remove_file(&appimage);
            println!("Removed {appimage}");
        }
    }

    #[cfg(target_os = "macos")]
    {
        let app = "/Applications/OggyBridge.app";
        if std::path::Path::new(app).exists() {
            let st = std::process::Command::new("rm").args(["-rf", app]).status();
            match st {
                Ok(s) if s.success() => println!("Removed {app}"),
                _ => eprintln!("Failed to remove {app}. Try: rm -rf {app}"),
            }
        } else {
            println!("OggyBridge not found at {app}");
        }
    }

    println!("Done. Config/data at ~/.config/oggybridge can be removed manually.");
}

fn extract_json_str<'a>(json: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{key}\"");
    let pos = json.find(&needle)?;
    let after = json[pos + needle.len()..].trim_start();
    let after = after.strip_prefix(':')?.trim_start();
    let after = after.strip_prefix('"')?;
    let end = after.find('"')?;
    Some(&after[..end])
}
