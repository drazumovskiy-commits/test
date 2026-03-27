# Pull Request Plan: Quick Lang Switch — Clutter grab для поглощения modifier key release

**Upstream:** [ankostis/gnome-shell-quick-lang-switch](https://github.com/ankostis/gnome-shell-quick-lang-switch)
**Связанные issues:** [#17](https://github.com/ankostis/gnome-shell-quick-lang-switch/issues/17), [#16](https://github.com/ankostis/gnome-shell-quick-lang-switch/issues/16)
**Статус:** план, не начато

---

## Проблема

Quick Lang Switch убирает OSD-попап GNOME Shell при переключении раскладки, но вместе с попапом убирает и keyboard grab (`Main.pushModal()` → `global.stage.grab()`), который попап использовал. Без grab'а событие key release Alt доходит до X11-клиентов:

- **Electron-приложения** (Slack, Discord и др.) интерпретируют Alt release как активацию меню → фокус уходит из поля ввода. Баг Electron с 2019 года ([electron#22213](https://github.com/electron/electron/issues/22213)), не исправлен. VS Code/Cursor обошли это внутренне (`window.customMenuBarAltFocus: false`), Slack — нет.
- Issue #17 описывает ровно эту проблему. Закрыта как "unrelated".
- Issue #16 описывает смежную проблему потери фокуса. Закрыта как "invalid".

## Решение

После `sources[ni].activate(true)` делать `global.stage.grab(actor)` на время удержания модификаторов. Grab перехватывает key release события на уровне Clutter, не пуская их в X11-клиенты. В отличие от `Main.pushModal()`, голый `global.stage.grab()` **не переносит фокус** (`set_key_focus` не вызывается), поэтому виджеты IDE не закрываются.

### Исследованные и отброшенные подходы

| Подход | Почему не работает |
|---|---|
| `KeyboardManager.holdKeyboard()` / `releaseKeyboard()` | Использует `freeze_keyboard()` — события ставятся в очередь и реплеятся при unfreeze |
| `Main.pushModal()` / `Main.popModal()` | Clutter grab работает, но `pushModal` вызывает `set_key_focus(actor)` → крадёт фокус у IDE → виджеты закрываются |
| `global.stage.grab()` / `grab.dismiss()` | **Работает.** Перехватывает события без смены фокуса |

## Риски совместимости

### API `global.stage.grab()` — доступность по версиям

API появился в GNOME 42 (рефакторинг Clutter grab-системы). Текущая ESM-версия расширения (v9+) поддерживает **только GNOME 45–49**. `Main.pushModal()` использует `global.stage.grab()` внутри на всех поддерживаемых версиях → **API гарантированно доступен.** Риск: низкий.

### Wayland vs X11 — **главный риск**

| | X11 | Wayland |
|---|---|---|
| Как работает `stage.grab()` | `XIGrabDevice` — проверенный X11 механизм | Внутренний Clutter grab — другой путь |
| SwitcherPopup (оригинальный попап) | Работает | Работает |
| Наш `stage.grab()` без `pushModal` | Работает (проверено на Ubuntu 24.04 X11) | **Не проверено** |

На Wayland keyboard grab менее надёжен — известные баги ([Debian #874526](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=874526)). SwitcherPopup тоже использует `stage.grab()`, но через `pushModal`, который добавляет modal stack и seat state check. Мы эту обработку пропускаем.

**Конкретная проблема**: SwitcherPopup проверяет `grab.get_seat_state() & Clutter.GrabState.KEYBOARD` и откатывается если keyboard grab не получен. Мы эту проверку не делаем — на Wayland фикс может молча не сработать.

**Нужно:** добавить проверку `seatState`, тестирование на Wayland.

### Edge cases текущего кода

| Сценарий | Текущее поведение | Проблема |
|---|---|---|
| Быстрое двойное переключение | Предыдущий timeout отменяется, новый grab ставится | Ок |
| Disable расширения во время grab'а | `disable()` чистит timeout, но не dismiss'ит текущий grab | **Баг** — grab может зависнуть |
| Alt+Tab во время 200мс grab'а | Два grab'а конфликтуют | **Возможна проблема** — не проверено |
| Медленное отпускание клавиш (>200мс) | Grab снимется до release → Alt пролетит | **Таймаут не гарантирует** |
| Быстрый набор после переключения (<200мс) | Символы уйдут в grab-актор | **Потеря ввода** |

### Дистрибутивы и KDE

- **KDE** — не актуально, это GNOME Shell extension
- **Разные дистрибутивы** (Ubuntu, Fedora, Arch) — расширение работает на уровне GNOME Shell JS API, дистрибутив-агностик. Если GNOME Shell одной версии — поведение идентично. Риск: нет.

---

## Что нужно сделать для PR

### 0. Исправить баги текущего кода (нужно и для себя, не только для PR)

- **Добавить проверку `seatState & KEYBOARD`** — если grab не получил клавиатуру, не полагаться на него (graceful degradation)
- **Добавить dismiss текущего grab'а в `disable()`** — не оставлять зависший grab при отключении расширения
- **Хранить ссылку на текущий grab** в переменной, чтобы можно было dismiss'ить из `disable()`

### 1. Event-based grab release (вместо таймаута)

Текущая рабочая версия использует `GLib.timeout_add(200ms)` для снятия grab'а. Для PR нужно заменить на event-based подход — как в оригинальном `SwitcherPopup.vfunc_key_release_event`:

```javascript
// Идея: grabActor слушает key-release-event
// Когда все модификаторы отпущены → grab.dismiss()
// Fallback-таймаут на случай если release не пришёл (например, потеря фокуса)
```

Референс: `js/ui/switcherPopup.js`, метод `vfunc_key_release_event` — проверяет `mods & this._modifierMask`, при нулевом результате вызывает `_finish()`.

### 2. Минимальный diff

Изменения только в `_quickSwitchLayouts()` + `enable()` / `disable()`. Не трогать остальную логику, стиль, форматирование.

### 3. Убрать debug-логи

Все `console.log` с `[QLS-DEBUG]` — убрать полностью (не комментировать).

### 4. Решить проблему module-level state

Сейчас `_grabActor` и `_grabTimeoutId` — module-level `let`. Для PR лучше:
- Передавать через closure в `enable()`, или
- Хранить на extension instance и передавать в handler

### 5. Описание PR

```
## Summary
- Fix Alt key leaking to X11 clients after layout switch (fixes #17)
- Fix focus loss in apps with popup widgets (related to #16)

## Problem
The extension bypasses the GNOME Shell switcher popup, which also removes
the keyboard grab that the popup maintained. Without this grab, modifier
key release events (especially Alt) reach X11 clients. Electron apps
(Slack, Discord) interpret bare Alt release as menu bar activation.

## Solution
After switching the input source, briefly hold a Clutter grab
(global.stage.grab()) to consume modifier key release events. Unlike
Main.pushModal(), the raw grab does not call set_key_focus(), so it
does not steal focus from the active window.

The grab is dismissed when all modifier keys are released (detected via
key-release-event), with a fallback timeout.

## Test plan
- [ ] Alt+Shift switch in Slack — menu should NOT activate
- [ ] Alt+Shift switch with Cursor/VS Code popup open — popup should NOT close
- [ ] Rapid double switch (Alt+Shift twice within 200ms)
- [ ] Switch and immediately start typing — no lost keystrokes
- [ ] Test on X11
- [ ] Test on Wayland
- [ ] Test on GNOME 45, 46, 47, 48, 49
- [ ] Test disable/enable extension during active grab
- [ ] Test concurrent grab (Alt+Tab during layout switch)
```

### 6. Стратегия подачи

1. **Сначала открыть issue** — описать механизм проблемы, почему это баг расширения (а не Electron), приложить анализ кода GNOME Shell (`pushModal` vs `stage.grab`). Сослаться на #17 и #16.
2. **Дождаться реакции мейнтейнера** — ankostis дважды отмахивался, нужно убедить. Подробное техническое описание + логи.
3. **Потом PR** — когда мейнтейнер подтвердит что проблема валидна.

## Файлы

- [quick-lang-switch-original.js](quick-lang-switch-original.js) — оригинал расширения (v16)
- [quick-lang-switch-patched.js](quick-lang-switch-patched.js) — рабочая версия с таймаутом (наш локальный патч)
