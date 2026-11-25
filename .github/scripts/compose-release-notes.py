#!/usr/bin/env python3
import argparse
import re
import subprocess
from pathlib import Path
from typing import List


def detect_prev_tag(tag: str) -> str:
    try:
        out = subprocess.check_output(
            ["git", "tag", "--sort=-v:refname"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        all_tags = [line.strip() for line in out.splitlines() if line.strip()]
        if tag in all_tags:
            idx = all_tags.index(tag)
            if idx + 1 < len(all_tags):
                return all_tags[idx + 1]
    except Exception:
        pass
    try:
        out = subprocess.check_output(
            ["git", "describe", "--tags", "--abbrev=0", f"{tag}^"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out
    except Exception:
        return ""


def extract_changelog_section(changelog_path: Path, version: str) -> str:
    if not changelog_path.exists():
        return ""
    text = changelog_path.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^##\s+\[?v?{re.escape(version)}\]?[^\n]*\n(.*?)(?=^##\s+\[|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        return ""
    return match.group(1).strip()


def fallback_git_log(prev_tag: str, tag: str) -> str:
    rev_range = f"{prev_tag}..{tag}" if prev_tag else tag
    try:
        out = subprocess.check_output(
            ["git", "log", "--no-merges", "--pretty=format:- %s (`%h`)", rev_range],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        lines = [line.strip() for line in out.splitlines() if line.strip()]
        filtered = [
            line
            for line in lines
            if not re.search(r"chore\(release\):\s*bump version to ", line, re.IGNORECASE)
        ]
        chosen = filtered if filtered else lines
        return "\n".join(chosen)
    except Exception:
        return ""


def main() -> None:
    parser = argparse.ArgumentParser(description="Compose standardized Release Notes.")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--prev-tag", default="")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--changelog", default="CHANGELOG.md")
    parser.add_argument("--install-guide", default=".github/release-notes/macos-unsigned-zh-CN.md")
    parser.add_argument("--intro", default=".github/release-notes/intro-bilingual.md")
    parser.add_argument("--dist-dir", default="")
    parser.add_argument("--assets-json", default="")
    parser.add_argument("--output", default="release_body.md")
    args = parser.parse_args()

    tag = args.tag.strip()
    version = tag[1:] if tag.startswith("v") else tag
    prev_tag = args.prev_tag.strip() or detect_prev_tag(tag)

    changelog_body = extract_changelog_section(Path(args.changelog), version)
    if not changelog_body:
        changelog_body = fallback_git_log(prev_tag, tag) or "- Routine maintenance and stability improvements."

    sections: List[str] = []

    # 1. 首要展示：更新内容
    update_lines = [f"## 更新内容 / What's New ({tag})", ""]
    if "-" in tag:
        update_lines.extend(
            [
                "> [!NOTE]",
                "> ❗ **Pre-release**：此版本为预发布版，可能包含实验性改动与未完成特性。",
                "",
            ]
        )
    update_lines.append(changelog_body)
    if prev_tag:
        update_lines.extend(["", f"**Full Changelog**: https://github.com/{args.repo}/compare/{prev_tag}...{tag}"])
    sections.append("\n".join(update_lines).strip())

    # 2. 次要展示：安装说明
    install_path = Path(args.install_guide)
    if install_path.exists():
        sections.append(install_path.read_text(encoding="utf-8").strip())

    # 3. 再次展示：轻量产品描述、对比、Git 与下载链接
    intro_path = Path(args.intro)
    if intro_path.exists():
        sections.append(intro_path.read_text(encoding="utf-8").strip())

    final_body = "\n\n---\n\n".join(s for s in sections if s) + "\n"
    Path(args.output).write_text(final_body, encoding="utf-8")


if __name__ == "__main__":
    main()
