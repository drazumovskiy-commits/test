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

### Результат

- Переключение раскладки по Alt+Shift работает
- Фокус в Slack и других Electron-приложениях **не уходит** на меню
- Настройки хранятся в `dconf`, переживают перезагрузку
- Незначительное косметическое мерцание при переключении (GNOME Shell popup)

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
