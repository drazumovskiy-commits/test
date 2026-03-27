# Миграция данных Cursor на новый ноутбук

**Дата:** 27 марта 2026
**Источник:** `/home/d.razumovskiy/work/old-notebook-backup/`

---

## Что перенесено

### 1. Глобальные настройки Cursor

| Что | Файл | Статус |
|---|---|---|
| MCP-серверы (7 шт: miro, playwright, voice-mode, talktocursor, kokoro-tts, techlog-clickhouse, slack) | `~/.cursor/mcp.json` | Скопирован из бэкапа |
| Settings (fontSize, git, openFolders) | `~/.config/Cursor/User/settings.json` | Скопирован из бэкапа |
| Keybindings | `~/.config/Cursor/User/keybindings.json` | Пропущен (ручная настройка) |

### 2. Расширения (16 штук, установлены через CLI)

```
eamodio.gitlens, waderyan.gitblame, ms-python.python, ms-python.debugpy,
ms-toolsai.jupyter, ms-toolsai.jupyter-renderers, ms-toolsai.vscode-jupyter-cell-tags,
ms-toolsai.vscode-jupyter-slideshow, bmewburn.vscode-intelephense-client,
recca0120.vscode-phpunit, ryanluker.vscode-coverage-gutters, nadako.vshaxe,
openfl.lime-vscode-extension, antfu.slidev, saoudrizwan.claude-dev,
anysphere.cursorpyright (автоматически)
```

### 3. Проект hw-all

| Что | Путь | Статус |
|---|---|---|
| Rules (2 .mdc файла) | `~/work/nx/hw-all/.cursor/rules/` | Скопирован |
| Project MCP (atlassian, gitlab, mysql) | `~/work/nx/hw-all/.cursor/mcp.json` | Скопирован |
| Skills (5 шт) | `~/work/nx/hw-all/.cursor/skills/` | Скопированы |
| Agent transcripts (242 чата) | `~/.cursor/projects/home-d-razumovskiy-work-nx-hw-all/agent-transcripts/` | Скопированы |
| Чаты в UI sidebar | — | **Не перенесены** (требуют БД) |

### 4. Зависимости для MCP-серверов

| Что | Команда установки |
|---|---|
| Node.js v24.13 + npx | `curl -fsSL https://deb.nodesource.com/setup_lts.x \| sudo -E bash - && sudo apt install -y nodejs` |
| uv 0.11.2 + uvx | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| sqlite3 | `sudo apt install -y sqlite3` |

---

## Что НЕ перенесено (осознанное решение)

### История чатов в UI Cursor

Чаты отображаются в sidebar через цепочку:
- `workspaceStorage/state.vscdb` → `composer.composerData` (заголовки: имя, UUID, дата)
- `globalStorage/state.vscdb` → `cursorDiskKV` (полные тексты: composerData, bubbleId, agentKv)

**Проблема:** `globalStorage/state.vscdb` в бэкапе **частично повреждена** (4 ГБ, ошибки в cursorDiskKV).

### Что удалось извлечь (но не использовали)

| Источник | Данные | Свежесть | Качество |
|---|---|---|---|
| `globalStorage` dump | 102 полных чата + 13753 bubbles + 32295 agentKv | до 27 февраля | Валидные (через `.dump`) |
| WAL-файл (6.2 МБ) | 25 чатов (фрагменты) | до 27 марта | **Фрагментированы** между SQLite-страницами, JSON не собирается |
| `workspaceStorage` | 290 заголовков чатов hw-all | до 27 марта | Здоровая БД |

### Почему не переносили

1. **Замена globalStorage** убила бы данные текущих проектов (ubuntu-adjust)
2. **Мерж INSERT-ами** — технически возможен для 102 старых чатов (февраль), но свежие (март) недоступны
3. **WAL-данные** — фрагментированы, надёжный парсинг невозможен
4. Решение: **не рисковать стабильностью** рабочей машины ради истории

### Где лежат старые чаты для ручного чтения

- **agent-transcripts:** `~/.cursor/projects/home-d-razumovskiy-work-nx-hw-all/agent-transcripts/<uuid>/<uuid>.jsonl` — полные тексты 242 чатов в JSONL
- **Бэкап БД:** `~/work/old-notebook-backup/system/.config/Cursor/User/globalStorage/state.vscdb` — 102 чата доступны через `.dump`

---

## Структура данных Cursor (справка)

```
~/.cursor/                              # Глобальный конфиг Cursor
├── mcp.json                           # MCP-серверы (глобальные)
├── extensions/                         # Установленные расширения
├── projects/<project-hash>/            # Данные по проектам
│   ├── agent-transcripts/             # JSONL-файлы чатов (независимы от БД)
│   ├── mcps/                          # MCP-дескрипторы
│   └── ...
└── skills-cursor/                     # Встроенные скиллы

~/.config/Cursor/User/                  # Electron-часть Cursor
├── settings.json                       # Настройки
├── keybindings.json                    # Горячие клавиши
├── globalStorage/
│   ├── state.vscdb                    # Общая БД (все проекты)
│   │   ├── ItemTable                  # Настройки, layout, метаданные
│   │   └── cursorDiskKV               # Полные тексты чатов (composerData, bubbleId, agentKv)
│   └── storage.json                   # Workspace mapping, telemetry
└── workspaceStorage/<hash>/
    ├── state.vscdb                    # Per-project БД
    │   ├── ItemTable → composer.composerData  # Заголовки чатов проекта
    │   └── cursorDiskKV               # (обычно пуст)
    └── workspace.json                 # URI проекта → хэш

~/work/project/.cursor/                 # Проектный конфиг (в папке проекта)
├── rules/                             # .mdc правила
├── mcp.json                           # MCP-серверы (проектные)
└── skills/                            # Проектные скиллы
```

---

## Возможные будущие действия

1. **cursaves** (`uv tool install git+https://github.com/Callum-Ward/cursaves.git`) — CLI для синхронизации чатов между машинами. Может пригодиться для будущих переездов.
2. **Settings Sync** — у Cursor пока нет полноценной облачной синхронизации (только Profile Export/Import для настроек и расширений).
3. **Мерж 102 чатов из дампа** — технически возможен INSERT-ами в текущие здоровые БД, если понадобится доступ к февральским чатам через UI.
