# Настройка Ubuntu 24.04 для комфортной работы

**Дата:** 27 марта 2026
**Система:** Ubuntu 24.04.4 LTS, GNOME Shell 46.0, X11

---

## 1. Русский язык и переключение раскладки (Alt+Shift)

### Исходная ситуация

- Раскладки `us` и `ru` были добавлены в систему
- Русские языковые пакеты полностью установлены (`language-pack-ru`, `language-pack-gnome-ru`, `hunspell-ru`)
- Переключение стояло на `Super+Space` (по умолчанию)
- Через GUI (Settings → Keyboard → Typing) невозможно назначить Alt+Shift — GNOME не умеет захватывать комбинацию из двух модификаторов через этот интерфейс

### Решение (начальное)

1. Установлен **GNOME Tweaks** через App Center
2. В Tweaks: **Keyboard → Additional Layout Options → Switching to another layout → Alt+Shift**

Это устанавливает XKB-опцию `grp:alt_shift_toggle` — переключение работает, но на низком уровне X11.

### Проблема: Electron-приложения теряют фокус

В Slack и других Electron-приложениях при нажатии Alt+Shift фокус уходил из поля ввода на меню приложения. Причина: XKB-уровень переключения пропускает нажатие Alt в приложение, а Electron интерпретирует Alt как активацию меню. Это баг Electron начиная с версии 6.0 (2019), не исправлен до сих пор ([electron#22213](https://github.com/electron/electron/issues/22213)).

В Cursor/VS Code проблемы нет — они добавили внутренние костыли (`window.customMenuBarAltFocus: false`). Slack таких настроек не имеет.

### Решение (финальное): переключение через GNOME Shell вместо XKB

Идея: перенести переключение раскладки с уровня XKB (пропускает Alt в приложения) на уровень GNOME Shell (перехватывает комбинацию до приложений, как `Super+Space`).

```bash
# 1. Убрать XKB-переключение
gsettings set org.gnome.desktop.input-sources xkb-options "[]"

# 2. Назначить Alt+Shift на уровне GNOME Shell
gsettings set org.gnome.desktop.wm.keybindings switch-input-source "['<Alt>Shift_L']"

# 3. Убрать дублирующий IBus-биндинг (уменьшает мерцание)
gsettings set org.freedesktop.ibus.general.hotkey next-engine "[]"
gsettings set org.freedesktop.ibus.general.hotkey next-engine-in-menu "[]"
```

### Откат (если что-то пойдёт не так)

```bash
gsettings set org.gnome.desktop.input-sources xkb-options "['grp:alt_shift_toggle']"
gsettings reset org.gnome.desktop.wm.keybindings switch-input-source
gsettings set org.freedesktop.ibus.general.hotkey next-engine "['Alt+Shift_L']"
gsettings set org.freedesktop.ibus.general.hotkey next-engine-in-menu "['Alt+Shift_L']"
```

### Проблема: GNOME Shell popup крадёт фокус у IDE

Переключение через GNOME Shell (`switch-input-source`) показывает OSD-попап (оверлей со списком раскладок, аналогичный Alt+Tab). Этот попап на долю секунды забирает фокус у активного окна. Побочный эффект: открытые виджеты в Cursor/VS Code и других IDE (дропдауны, quick pick, branch selector, палитра команд) **закрываются** при переключении раскладки, т.к. теряют фокус.

Проблема массовая — затрагивает IntelliJ, VS Code, Electron-приложения и любые программы с popup-виджетами.

### Решение (этап 1): Quick Lang Switch (GNOME Shell extension)

Расширение [Quick Lang Switch](https://github.com/ankostis/gnome-shell-quick-lang-switch) подменяет внутренний метод GNOME Shell: вместо показа OSD-попапа вызывает мгновенное переключение раскладки (`InputSourceManager._modifiersSwitcher`). Биндинг `switch-input-source` остаётся прежним, попап просто не появляется.

Установка:

```bash
git clone https://github.com/ankostis/gnome-shell-quick-lang-switch \
  ~/.local/share/gnome-shell/extensions/quick-lang-switch@ankostis.gmail.com

gnome-extensions enable quick-lang-switch@ankostis.gmail.com
```

Если расширение не обнаруживается — перелогиниться (на Wayland обязательно, на X11 можно попробовать `Alt+F2` → `r` → Enter для перезапуска GNOME Shell).

Совместимость: GNOME 46 с версии v11 (апрель 2024), поддержка до GNOME 49 (сентябрь 2025). Если выйдет новая версия GNOME, достаточно добавить номер версии в `metadata.json` расширения.

### Проблема: Quick Lang Switch вернул утечку Alt в Slack

Quick Lang Switch убирает попап — Cursor-виджеты больше не закрываются. Но попутно убирает и **keyboard grab**, который попап делал через `Main.pushModal()`. Без grab'а событие key release Alt снова проходит в Electron-приложения → Slack опять ловит Alt и активирует меню.

Суть: оригинальный попап GNOME Shell делал `pushModal()` → `global.stage.grab(actor)`, что перенаправляло все клавиатурные события (включая release) на попап-актор, не пуская их в приложения. Quick Lang Switch этот grab убрал вместе с попапом.

### Решение (этап 2): патч Quick Lang Switch — добавление Clutter grab

Идея: после переключения раскладки делать голый `global.stage.grab()` (без `pushModal`, который крадёт фокус) на 200мс — достаточно, чтобы поглотить key release от Alt и Shift. Раскладка переключается мгновенно (до grab'а), grab только блокирует утечку модификаторов.

Исследованные и отброшенные подходы:
- `KeyboardManager.holdKeyboard()` / `releaseKeyboard()` — использует `freeze_keyboard()`, который только ставит события в очередь. При `releaseKeyboard()` они реплеятся обратно в приложение. **Не работает.**
- `Main.pushModal()` / `Main.popModal()` — делает Clutter grab (события не доходят до приложений), **но** внутри вызывает `global.stage.set_key_focus(actor)`, что переносит фокус на grab-актор. Cursor видит потерю фокуса → закрывает виджеты. **Не подходит** — заменяет одну проблему другой.
- `global.stage.grab()` / `grab.dismiss()` — голый Clutter grab без смены фокуса. События перехватываются, фокус остаётся на месте. **Работает.**

Патч применён локально к файлу:

```
~/.local/share/gnome-shell/extensions/quick-lang-switch@ankostis.gmail.com/extension.js
```

Копии файлов в этом репозитории:
- Оригинал: [quick-lang-switch-original.js](quick-lang-switch-original.js)
- Патченый: [quick-lang-switch-patched.js](quick-lang-switch-patched.js)

Применение патча (если нужно восстановить):

```bash
cp quick-lang-switch-patched.js \
  ~/.local/share/gnome-shell/extensions/quick-lang-switch@ankostis.gmail.com/extension.js
```

Откат к оригиналу:

```bash
cp quick-lang-switch-original.js \
  ~/.local/share/gnome-shell/extensions/quick-lang-switch@ankostis.gmail.com/extension.js
```

После любого изменения — перезапуск GNOME Shell: `Alt+F2` → `r` → Enter.

### Результат

- Переключение раскладки по Alt+Shift работает мгновенно
- Фокус в Slack и других Electron-приложениях **не уходит** на меню
- Попапы и виджеты в Cursor/VS Code/IntelliJ **не закрываются** при переключении
- OSD-попап GNOME Shell **не появляется** — переключение визуально незаметно
- Настройки хранятся в `dconf`, переживают перезагрузку
- В патченом расширении есть закомментированные debug-логи (`[QLS-DEBUG]`), включаются раскомментированием; смотреть через `sudo journalctl -f -o cat | grep QLS-DEBUG`

---

## 2. Панель как в Windows (Dash to Panel)

### Исходная ситуация

- Стандартная конфигурация Ubuntu: вертикальный док слева + верхняя панель GNOME
- Нужна горизонтальная панель внизу с иконками приложений, системным треем и часами (как в Windows)

### Решение

1. Установлен **Extension Manager** через App Center
2. В Extension Manager: вкладка **Browse** → поиск **Dash to Panel** → Install
3. Расширение автоматически заменило док и верхнюю панель на единую горизонтальную панель внизу экрана

### Результат

Панель задач внизу экрана: иконки приложений, системный трей, часы — всё в одной панели.

---

## 3. Синхронизация закладок Chrome

### Исходная ситуация

- Google Chrome установлен, вход в аккаунт Google выполнен
- Закладки со старого ноутбука не отображались
- Файл `Bookmarks` в профиле Chrome отсутствовал — синхронизация не была включена

### Решение

1. Открыть Chrome → Settings → **You and Google**
2. Нажать кнопку **Turn on Sync** (рядом с именем профиля)
3. Подтвердить включение синхронизации

Прямая ссылка на настройку: `chrome://settings/syncSetup`

### Результат

После включения синхронизации закладки, пароли и расширения подтягиваются из облака Google автоматически.

---

## Установленные утилиты для настройки

| Утилита | Назначение | Источник |
|---|---|---|
| GNOME Tweaks | Расширенные настройки GNOME (раскладки, шрифты, внешний вид) | App Center |
| Extension Manager | Управление расширениями GNOME Shell | App Center |
| Dash to Panel | Панель задач как в Windows | Extension Manager (GNOME Extensions) |
| Quick Lang Switch | Мгновенное переключение раскладки без OSD-попапа (патченый, с Clutter grab) | [GitHub](https://github.com/ankostis/gnome-shell-quick-lang-switch) + локальный патч |
