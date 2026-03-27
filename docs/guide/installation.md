# Kore-Chamber Installation Guide

> Inspired by [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)'s AI-driven installation approach.

## For Users

```bash
npx kore-chamber init
```

Follow the prompts. That's it.

---

## For AI Agents

> If a user asks you to install Kore-Chamber, follow these steps exactly.

### Step 0: Prerequisites Check

Verify the user has:
- **Node.js 18+**: Run `node --version`
- **Claude Code**: The user should be running this conversation inside Claude Code

If any prerequisite is missing, guide the user to install it first.

### Step 1: Run Init CLI

Execute:
```bash
npx kore-chamber init
```

This is an **interactive CLI**. It will ask the user 7 questions:
1. Vault path (Obsidian vault folder location)
2. Field of study
3. Current level
4. Goals
5. Learning style
6. Deep interest areas
7. History scan option (full / recent / skip)

**Do NOT answer these for the user.** Let the CLI prompt them directly. Wait for the CLI to complete.

### Step 2: Verify Installation

After the CLI completes, verify:

```bash
# Skills installed
ls ~/.claude/commands/kc-*.md

# Agents installed
ls ~/.claude/agents/scavenger.md ~/.claude/agents/sentinel.md ~/.claude/agents/librarian.md ~/.claude/agents/explorer.md

# Config created
cat ~/.kore-chamber/config.yaml

# Vault structure created
ls "$(cat ~/.kore-chamber/config.yaml | grep vault_path | cut -d'"' -f2 || cat ~/.kore-chamber/config.yaml | awk '{print $2}')"
```

Expected: 3 skill files, 4 agent files, config with vault_path, vault folder with AI-GUIDE.md and numbered folders.

### Step 3: Run /kc-init

Tell the user to run:
```
/kc-init
```

This will:
- Generate MY-PROFILE.md from their init answers
- Create initial MOCs based on their goals
- Optionally run History to Chamber (if they chose to scan existing conversations)

### Step 4: Verify Vault

After /kc-init completes:

```bash
vault_path="$(cat ~/.kore-chamber/config.yaml | grep vault_path | cut -d'"' -f2 || cat ~/.kore-chamber/config.yaml | awk '{print $2}')"
ls "$vault_path/MY-PROFILE.md"
ls "$vault_path/50-MOC/"
```

Expected: MY-PROFILE.md exists, MOC files created.

### Step 5: Done

Tell the user:

```
✅ Kore-Chamber 설치 완료!

사용법:
- 평소처럼 AI와 대화하세요
- 대화 끝에 /kc-collect → 지식 자동 수확
- 뭘 모르겠으면 /kc-explore → 갭 분석

AI에게 나의 뇌를 선물하세요. 🧠
```
