#!/usr/bin/env python3
"""
Sync GitHub Release metadata and built assets to Gitee.
"""
import os
import sys
import json
import urllib.request
import urllib.error
import subprocess

def main():
    token = os.environ.get("GITEE_TOKEN")
    user = os.environ.get("GITEE_USER", "cmflovekm")
    repo = os.environ.get("GITEE_REPO")
    tag = os.environ.get("RELEASE_TAG")
    body_file = os.environ.get("RELEASE_BODY_PATH")
    dist_dir = os.environ.get("DIST_DIR", "dist")

    if not token or not repo or not tag:
        print("[Gitee Sync] Missing required environment variables (GITEE_TOKEN, GITEE_REPO, RELEASE_TAG). Skipping.")
        return 0

    body = ""
    if body_file and os.path.exists(body_file):
        with open(body_file, "r", encoding="utf-8") as f:
            body = f.read()

    body += f"\n\n---\n**GitHub 官方 Release 地址与完整安装包**: https://github.com/scott20201225/{repo}/releases/tag/{tag}\n"

    # 1. Check if release exists on Gitee
    check_url = f"https://gitee.com/api/v5/repos/{user}/{repo}/releases/tags/{tag}?access_token={token}"
    release_id = None
    try:
        req = urllib.request.Request(check_url, headers={"User-Agent": "GitHub-Actions-Sync"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            release_id = data.get("id")
            print(f"[Gitee Sync] Release already exists on Gitee with ID: {release_id}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("[Gitee Sync] Release does not exist yet on Gitee. Creating...")
        else:
            print(f"[Gitee Sync] Warning checking release: {e}")

    # 2. Create release if not exists
    if not release_id:
        create_url = f"https://gitee.com/api/v5/repos/{user}/{repo}/releases"
        payload = {
            "access_token": token,
            "tag_name": tag,
            "name": tag,
            "body": body,
            "target_commitish": "main",
            "prerelease": ("-" in tag)
        }
        req = urllib.request.Request(
            create_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json;charset=UTF-8", "User-Agent": "GitHub-Actions-Sync"}
        )
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                release_id = data.get("id")
                print(f"[Gitee Sync] Successfully created Gitee Release with ID: {release_id}")
        except Exception as e:
            print(f"[Gitee Sync] Error creating Gitee release: {e}")
            return 0

    # 3. Upload assets
    if release_id and os.path.isdir(dist_dir):
        files = sorted(os.listdir(dist_dir))
        for filename in files:
            filepath = os.path.join(dist_dir, filename)
            if not os.path.isfile(filepath):
                continue
            size_mb = os.path.getsize(filepath) / (1024 * 1024)
            print(f"[Gitee Sync] Uploading {filename} ({size_mb:.2f} MB)...")

            cmd = [
                "curl", "-s", "-X", "POST",
                f"https://gitee.com/api/v5/repos/{user}/{repo}/releases/{release_id}/attach_files",
                "-F", f"access_token={token}",
                "-F", f"file=@{filepath}"
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if "browser_download_url" in res.stdout:
                print(f"[Gitee Sync] Successfully uploaded {filename}")
            else:
                resp_preview = res.stdout.strip()[:160]
                print(f"[Gitee Sync] Notice for {filename}: {resp_preview}")

    print("[Gitee Sync] Release synchronization finished.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
