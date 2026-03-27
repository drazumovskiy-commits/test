# Чеклист переезда со старого ноутбука

**Дата:** 27 марта 2026
**Ограничение:** ~13% батареи, ~5 минут на копирование

---

## Скрипт для сбора в архив

Запустить на СТАРОМ ноутбуке. Создаёт один файл `~/laptop-backup.tar.gz`, который потом вручную перетащить на флешку.

### Скрипт 1: быстрый (конфиги, ключи, профиль — секунды)

Скопировать и вставить в терминал (Ctrl+Shift+V):

```bash
gpg --export-secret-keys --armor > ~/gpg-secret-keys.asc 2>/dev/null; gpg --export --armor > ~/gpg-public-keys.asc 2>/dev/null; tar czf ~/backup-configs.tar.gz -C / home/$USER/.ssh home/$USER/.gitconfig home/$USER/.bashrc home/$USER/.profile home/$USER/.bash_aliases home/$USER/.bash_history home/$USER/.cursor home/$USER/.npmrc home/$USER/.yarnrc home/$USER/.aws home/$USER/.kube home/$USER/.docker home/$USER/.config/Cursor/User home/$USER/.config/Code/User home/$USER/.config/pip home/$USER/.config/wireguard home/$USER/.local/share/fonts home/$USER/gpg-secret-keys.asc home/$USER/gpg-public-keys.asc etc/hosts etc/openvpn 2>/dev/null; echo "=== КОНФИГИ ГОТОВЫ ==="; ls -lh ~/backup-configs.tar.gz
```

Результат: `~/backup-configs.tar.gz` — перетащить на флешку.

### Скрипт 2: проекты — только файлы НЕ под гитом (.env, локальные конфиги, .cursor)

Запускать после того как скрипт 1 уже на флешке. Обходит все git-репозитории в `~/work`, собирает только untracked и ignored файлы, плюс `.cursor` папки проектов. Исходный код и `.git` не трогает — их переклонируем.

```bash
FILELIST=$(mktemp); find ~/work -name ".git" -type d -prune | while read gitdir; do repo=$(dirname "$gitdir"); git -C "$repo" ls-files --others --ignored --exclude-standard 2>/dev/null | while read f; do [ -f "$repo/$f" ] && echo "$repo/$f"; done; git -C "$repo" ls-files --others --exclude-standard 2>/dev/null | while read f; do [ -f "$repo/$f" ] && echo "$repo/$f"; done; done | sort -u > "$FILELIST"; find ~/work -maxdepth 3 -name ".cursor" -type d 2>/dev/null >> "$FILELIST"; echo "Файлов: $(wc -l < "$FILELIST")"; tar czf ~/backup-work.tar.gz -T "$FILELIST" 2>/dev/null; rm "$FILELIST"; echo "=== ПРОЕКТЫ ГОТОВЫ ==="; ls -lh ~/backup-work.tar.gz
```

Результат: `~/backup-work.tar.gz` — перетащить на флешку. Будет компактным — только локальные файлы.

---

## Чеклист

### Обязательно забрать (упомянуто вами)

| # | Что | Путь на старом ноуте | Пояснение |
|---|---|---|---|
| 1 | Проекты с локальными файлами | `~/work/` | Целиком — включая .env, локальные конфиги, файлы вне git |
| 2 | Глобальный конфиг Cursor | `~/.cursor/` | Настройки MCP, история чатов, конфиг расширений |
| 3 | Проектные .cursor папки | `~/work/*/.cursor/` | AI-контекст, правила проекта (живут вне репы) |
| 4 | /etc/hosts | `/etc/hosts` | Кастомные записи хостов |
| 5 | Профиль шелла + переменные окружения | `~/.bashrc`, `~/.profile`, `~/.bash_aliases` | Переменные окружения, алиасы, PATH |
| 6 | Настройки MCP в Cursor | `~/.cursor/` (внутри #2) | Уже покрыто пунктом 2 |
| 7 | История чатов Cursor | `~/.cursor/` (внутри #2) | Уже покрыто пунктом 2 |

### Легко забыть, но нужно

| # | Что | Путь | Зачем |
|---|---|---|---|
| 8 | SSH-ключи | `~/.ssh/` | Авторизация в git, доступ к серверам — **нельзя восстановить** |
| 9 | Git-конфиг | `~/.gitconfig` | Имя, email, алиасы, ключ подписи |
| 10 | GPG-ключи | через `gpg --export` | Подпись коммитов — **нельзя восстановить** |
| 11 | Настройки VS Code/Cursor | `~/.config/Cursor/User/` | settings.json, keybindings.json, сниппеты |
| 12 | Конфиги npm/yarn/pip | `~/.npmrc`, `~/.yarnrc` | Токены реестров, настройки |
| 13 | Облачные конфиги | `~/.aws/`, `~/.kube/`, `~/.docker/` | Креденшалы, конфиги кластеров |
| ~~14~~ | ~~Кронтаб~~ | ~~`crontab -l`~~ | Не нужен — кронов нет |
| 15 | Шрифты | `~/.local/share/fonts/` | Если устанавливали свои |
| 16 | VPN-конфиги | `/etc/openvpn/`, WireGuard | Профили подключений |
| 17 | История bash | `~/.bash_history` | Полезные команды для справки |

### Уже решено (не нужно копировать)

| Что | Почему пропускаем |
|---|---|
| Закладки Chrome | Синхронизированы через Google-аккаунт (Turn on Sync) |
| Пароли Chrome | Синхронизированы через Google-аккаунт |
| Расширения Chrome | Синхронизированы через Google-аккаунт |

---

## Приоритеты (если батарея садится)

Хватать в таком порядке:

1. **`~/.ssh/`** — ключи невосстановимы
2. **`~/work/`** — все проекты с локальными файлами
3. **`~/.cursor/`** — конфиг Cursor + история чатов
4. **`~/.bashrc` + `~/.profile`** — переменные окружения
5. **`/etc/hosts`** — кастомные записи
6. **`~/.gitconfig`** — настройки git
7. Всё остальное
