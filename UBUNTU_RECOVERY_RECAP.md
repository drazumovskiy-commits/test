# Ubuntu GUI Recovery — Полный рекап диагностики и починки

**Дата:** 26-27 марта 2026  
**Машина:** Ноутбук Lenovo (рабочий), Ubuntu 24.04 LTS  
**Железо:**
- CPU: Intel Raptor Lake  
- GPU 1 (встроенная): **Intel Raptor Lake-S UHD Graphics** (rev 04) — экран ноутбука подключён к ней  
- GPU 2 (дискретная): **NVIDIA Device 28f8** (rev a1)  
- Диски: зашифрованы (LUKS)  
- SysRq: отключён на уровне ядра  

---

## Симптом

После разблокировки зашифрованного диска — чёрный экран с маленьким белым мигающим курсором (подчёркивание) в левом верхнем углу. Никакие клавиши не работают, TTY (Ctrl+Alt+F1-F6) не переключаются.

---

## Что произошло (причина поломки)

### Хронология событий (25-26 марта 2026):

1. Пользователь пытался установить **Cursor IDE** (`cursor_2.6.21_amd64.deb`)
2. apt не мог установить из-за конфликтов
3. Были выполнены команды (из интернета/ChatGPT):
   - `sudo chown -Rv _aptroot /var/cache/apt/archives/partial/` — сменил владельца кеша apt (безвредно для GUI, но ломает будущие apt install; правильный владелец `_apt`, а не `_aptroot`)
   - `sudo chmod -Rv 700 /var/cache/apt/archives/partial/` — сменил права на кеш apt (относительно безвредно)
   - `sudo killall apt-get` — **УБИЛ apt посреди установки пакетов** ← ОСНОВНАЯ ПРИЧИНА
4. В момент kill apt устанавливал пакеты для нового ядра **6.17.0-19-generic**
5. Пакет `linux-modules-extra-6.17.0-19-generic` **не доустановился** — в нём находится модуль **i915** (драйвер Intel-графики)
6. Дополнительно пользователь устанавливал `linux-headers-6.17.0-19-generic`
7. Пользователь выполнил `dpkg --configure -a` и `apt -f install`, потом **reboot**
8. GRUB загрузил самое новое ядро (6.17.0-19) → **нет модуля i915** → экран не работает → чёрный экран

### Корневая причина:
**Модуль i915 (драйвер встроенной Intel-графики) отсутствует в ядре 6.17.0-19-generic.** На ноутбуках с гибридной графикой (Intel + NVIDIA) экран физически подключён к Intel GPU. Без i915 ни Xorg, ни Wayland не могут вывести картинку. NVIDIA тут ни при чём — к ней монитор не подключен, ошибка `Cannot find any crtc or sizes` для NVIDIA нормальна на ноутбуке.

---

## Установленные ядра

| Ядро | Откуда | i915 | NVIDIA | Статус |
|------|--------|------|--------|--------|
| 6.8.0-101-generic | Оригинал Ubuntu 24.04 | ? (не проверяли) | есть .ko.sig | Старое |
| **6.17.0-14-generic** | HWE-обновление | **✓ ЕСТЬ** | есть .ko | **РАБОЧЕЕ, загружено сейчас** |
| 6.17.0-19-generic | Установка 25-26 марта | **✗ НЕТ** | есть .ko | Сломано (неполная установка) |

---

## Как попадали в recovery

1. GRUB меню не появлялось (таймаут 0 секунд)
2. Решение: при появлении GRUB консоли (`grub>`) вводить:
   ```
   set timeout=30
   insmod normal
   normal
   ```
3. Появляется меню → Advanced options → Recovery mode → root shell
4. `mount -o remount,rw /` для записи на диск

---

## Диагностика (что проверяли)

### 1. Логи ошибок загрузки (`journalctl -b -1 -p err`)
- "Failed to query NVIDIA devices"
- "Failed to start nvidia-persistenced.service"
- "GDM_IS_REMOTE_DISPLAY (display) failed" — многократно
- Вывод: GDM падает в цикл

### 2. NVIDIA-драйвер
- `modprobe nvidia` — **работает без ошибок**
- `/dev/nvidia*` устройства создаются
- `nvidia-persistenced` — запускается и работает
- Модули .ko есть в `/lib/modules/6.17.0-19-generic/kernel/nvidia-*/`
- Зарегистрированы в `modules.dep`
- **Вывод: NVIDIA драйвер полностью рабочий**

### 3. Intel-драйвер (i915)
- `lsmod` — **i915 НЕ загружен**
- `find /lib/modules/6.17.0-19-generic/ -name "i915*"` — **файлов НЕТ**
- `find /lib/modules/6.17.0-14-generic/ -name "i915*"` — **файлы ЕСТЬ** (kernel/drivers/gpu/drm/i915/)
- **Вывод: i915 отсутствует в ядре 6.17.0-19, есть в 6.17.0-14**

### 4. Xorg-лог
- "Screen 0 deleted because of no matching config section"
- "no devices detected"
- "no screens found" → Fatal server error
- **Вывод: Xorg не находит ни одного рабочего дисплея**

### 5. GDM конфигурация (`/etc/gdm3/custom.conf`)
- Полностью стандартная, всё закомментировано
- WaylandEnable не задан (Wayland по умолчанию включён)

### 6. Modprobe конфиги
- `nvidia-graphics-drivers-kms.conf` — стандартный для nvidia-driver-500
- `blacklist nvidiafb` — нормально (блокирует старый framebuffer, не основной драйвер)
- i915 нигде не заблокирован

### 7. dpkg/apt
- `dpkg --configure -a` — ничего не вывел (нет полусконфигурированных пакетов)
- `dpkg --audit` — чисто
- apt history показывает ошибки `dpkg returned error code (1)` при установке nvidia-модулей и cursor 25 марта

---

## Решение (временное — текущее)

Загрузка в ядро **6.17.0-14-generic** через GRUB:
1. Advanced options for Ubuntu → Ubuntu, with Linux 6.17.0-14-generic
2. GUI работает, i915 загружается

**Статус: система работает на ядре 6.17.0-14-generic.**

---

## Что ещё нужно сделать (TODO)

### Критично (иначе после перезагрузки опять чёрный экран):

- [ ] **Вариант А:** Доустановить модули для ядра 6.17.0-19:
  ```bash
  sudo apt update
  sudo apt install --reinstall linux-modules-extra-6.17.0-19-generic
  ```
  Потом проверить: `find /lib/modules/6.17.0-19-generic/ -name "i915*"`

- [ ] **Вариант Б:** Или удалить сломанное ядро 6.17.0-19 и остаться на 6.17.0-14:
  ```bash
  sudo apt remove linux-image-6.17.0-19-generic linux-modules-6.17.0-19-generic linux-modules-extra-6.17.0-19-generic linux-headers-6.17.0-19-generic
  sudo update-grub
  ```

- [ ] **Вариант В:** Или зафиксировать GRUB на ядре 6.17.0-14 (временная мера)

### Желательно:
- [ ] Починить права apt-кеша:
  ```bash
  sudo chown -R _apt:root /var/cache/apt/archives/partial/
  ```
- [ ] Установить Cursor IDE (изначальная задача)
- [ ] Разобраться с конфликтом Cursor и NVIDIA

---

## Важные уроки

1. **Никогда не делать `killall apt-get`** во время установки — это может оставить систему в неконсистентном состоянии
2. **Не запускать `Xorg :N` вручную из recovery** — он захватывает экран и клавиатуру без возможности вернуться (SysRq отключён, VT-переключение не работает)
3. Ubuntu держит старые ядра именно для таких случаев — всегда можно откатиться через GRUB
4. На ноутбуках с гибридной графикой (Intel + NVIDIA) экран подключён к Intel, а не к NVIDIA

---

## Системная информация

- **OS:** Ubuntu 24.04 LTS
- **Текущее рабочее ядро:** 6.17.0-14-generic
- **Display Manager:** GDM3 (GNOME Display Manager)
- **NVIDIA driver:** nvidia-driver-500 (Open Kernel Module)
- **Шифрование:** LUKS (полнодисковое)
- **GRUB timeout:** 0 (нужно зажимать Shift/Esc или вручную вызывать меню)
