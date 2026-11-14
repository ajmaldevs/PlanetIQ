#!/usr/bin/env python3
"""
TerraLens Environment Verification Script
Validates local tooling, dependencies, and environment variable configuration.
"""

import sys
import shutil
import os

def check_command(cmd: str, name: str) -> bool:
    found = shutil.which(cmd) is not None
    status = "OK" if found else "MISSING"
    print(f"[{status}] {name} ({cmd})")
    return found

def main():
    print("==========================================")
    print(" TerraLens Environment Verification")
    print("==========================================")
    
    python_ok = sys.version_info >= (3, 11)
    print(f"[{'OK' if python_ok else 'WARN'}] Python Version: {sys.version.split()[0]} (>= 3.11 required)")
    
    check_command("node", "Node.js runtime")
    check_command("npm", "Node package manager")
    check_command("git", "Git version control")
    check_command("uv", "Astral UV Python manager")
    
    env_exists = os.path.exists(".env")
    print(f"[{'FOUND' if env_exists else 'INFO'}] .env file: {'Configured' if env_exists else 'Not found (use .env.example)'}")
    
    print("==========================================")

if __name__ == "__main__":
    main()
