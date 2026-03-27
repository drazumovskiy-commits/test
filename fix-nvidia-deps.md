# Починка зависимостей NVIDIA после удаления сломанного ядра

**Дата:** 27 марта 2026
**Контекст:** продолжение после `restore-kernel.md`

---

## Что было сделано до этого

1. Удалено сломанное ядро `6.17.0-19-generic` (не имело модуля `i915`)
2. Система загружена и работает на `6.17.0-14-generic`
3. Cursor IDE установлен из `.deb`, работает из `/usr/share/cursor/`

---

## Проблема

При удалении ядра `6.17.0-19` вместе с ним улетел мета-пакет `nvidia-driver-580-open`, потому что:

```
nvidia-driver-580-open
  └── linux-modules-nvidia-580-open-generic-hwe-24.04   ← мета-пакет, привязан к новейшему ядру
        └── linux-modules-nvidia-580-open-6.17.0-19-generic  ← удалён вместе с ядром
```

После этого все userspace-библиотеки NVIDIA (`libnvidia-gl-580`, `libnvidia-compute-580` и т.д.) стали «сиротами» в глазах apt. Команда `apt autoremove` хотела удалить 25 пакетов, включая весь NVIDIA-стек.

**Физически NVIDIA работала** — модули ядра для `6.17.0-14` были на месте, `nvidia.ko` загружен, `/dev/nvidia*` существовали. Проблема была только в метаданных apt.

---

## Диагностика

Перед любыми действиями проведена полная проверка:

### Модули ядра NVIDIA для 6.17.0-14
```
/lib/modules/6.17.0-14-generic/kernel/nvidia-580/nvidia.ko
/lib/modules/6.17.0-14-generic/kernel/nvidia-580/nvidia-drm.ko
/lib/modules/6.17.0-14-generic/kernel/nvidia-580/nvidia-modeset.ko
/lib/modules/6.17.0-14-generic/kernel/nvidia-580/nvidia-uvm.ko
/lib/modules/6.17.0-14-generic/kernel/nvidia-580/nvidia-peermem.ko
```
Все 5 `.ko` файлов на месте.

### Загруженные модули (`lsmod`)
- `nvidia` — загружен (35 зависимостей)
- `nvidia_drm`, `nvidia_modeset`, `nvidia_uvm` — загружены
- `i915` — загружен (32 зависимости)

### Устройства
- `/dev/nvidia0`, `/dev/nvidiactl`, `/dev/nvidia-modeset`, `/dev/nvidia-uvm` — есть
- `/dev/dri/card1` (Intel), `/dev/dri/card2` (NVIDIA) — обе GPU видны

### Xorg/GDM
- Нет `/etc/X11/xorg.conf` (нет хардкода)
- `/usr/share/X11/xorg.conf.d/10-nvidia.conf` — стандартный, принадлежит `xserver-xorg-video-nvidia-580`
- `/usr/share/X11/xorg.conf.d/11-nvidia-offload.conf` — авто-генерируется `gpu-manager`
- GDM: стандартный конфиг, всё закомментировано
- Сессия: `x11`, PRIME: `on-demand`

### Modprobe
- `options nvidia_drm modeset=1` — стандарт для nvidia-driver-580
- `options nvidia NVreg_PreserveVideoMemoryAllocations=1` — сохранение VRAM при suspend
- `i915` нигде не заблокирован
- `nouveau` не упоминается (заблочен стандартно через `nvidia-kernel-common`)

---

## Решение

### Шаг 1: Установка `nvidia-driver-580`

```bash
sudo apt install nvidia-driver-580
```

Что произошло:
- Установлен `nvidia-driver-580` — мета-пакет, «якорь» для всех userspace-библиотек
- Установлен `nvidia-dkms-580` — DKMS для автосборки модулей при обновлении ядра
- Установлен `nvidia-kernel-source-580` (замена `nvidia-kernel-source-580-open`)
- Удалён `nvidia-kernel-source-580-open` (конфликтует с closed-вариантом)
- Доустановлены build-зависимости: `build-essential`, `dkms`, `g++`, `dpkg-dev`, `fakeroot` и др.
- DKMS собрал модули для ядра `6.17.0-14-generic` → установлены в `/lib/modules/6.17.0-14-generic/updates/dkms/`
- `initramfs` пересобран

### Шаг 2: Проверка `autoremove`

```bash
apt autoremove --simulate
```

Результат: **0 to remove** — цепочка зависимостей полностью восстановлена, все NVIDIA-пакеты защищены.

---

## Итоговое состояние

### NVIDIA-пакеты (все `ii` — installed)
- `nvidia-driver-580` — мета-пакет драйвера
- `nvidia-dkms-580` — DKMS
- `nvidia-kernel-source-580` — исходники модулей
- `nvidia-kernel-common-580` — общие файлы
- `nvidia-firmware-580-580.126.09` — firmware
- `nvidia-compute-utils-580` — compute-утилиты (`nvidia-smi` и др.)
- `nvidia-utils-580` — основные утилиты
- `nvidia-settings` — GUI настроек
- `nvidia-prime` — PRIME переключение GPU
- `libnvidia-gl-580` — OpenGL/Vulkan/EGL
- `libnvidia-compute-580` — CUDA compute
- `libnvidia-decode-580` — видео декодирование
- `libnvidia-encode-580` — видео кодирование (NVENC)
- `libnvidia-cfg1-580` — конфигурация
- `libnvidia-common-580` — общие файлы
- `libnvidia-extra-580` — доп. библиотеки
- `libnvidia-fbc1-580` — framebuffer capture
- `libnvidia-egl-wayland1` — Wayland-поддержка
- `xserver-xorg-video-nvidia-580` — Xorg-драйвер
- `screen-resolution-extra` — утилита разрешения
- `linux-modules-nvidia-580-6.17.0-14-generic` — модули ядра
- `linux-modules-nvidia-580-open-6.17.0-14-generic` — open-модули ядра
- `linux-objects-nvidia-580-6.17.0-14-generic` — объекты
- `linux-signatures-nvidia-6.17.0-14-generic` — подписи

### DKMS
```
nvidia/580.126.09, 6.17.0-14-generic, x86_64: installed
```

---

## Почему так произошло (архитектурная проблема apt/NVIDIA)

Userspace-библиотеки NVIDIA (`libnvidia-*`) — **общие** для всех ядер. Модули ядра (`linux-modules-nvidia-*`) — **свои для каждого ядра**. Но мета-пакет `nvidia-driver-580-open` был привязан через `linux-modules-nvidia-580-open-generic-hwe-24.04` к **самому новому** ядру.

При удалении этого ядра рвётся вся цепочка: мета-пакет ядра → мета-пакет драйвера → все userspace-библиотеки становятся «сиротами». Хотя модули для второго ядра на месте и NVIDIA фактически работает.

Это известная проблема архитектуры пакетирования NVIDIA в Ubuntu — userspace и kernel-space связаны через хрупкую цепочку мета-пакетов вместо явных зависимостей.

---

## Проблема: closed vs open модули

### Что пошло не так

Изначально стоял `nvidia-driver-580-open` (open kernel modules). При починке зависимостей был ошибочно установлен `nvidia-driver-580` (closed). DKMS скомпилировал **closed**-модуль (`license: NVIDIA`, 82 MB) вместо **open** (`license: Dual MIT/GPL`, 18 MB).

После перезагрузки NVIDIA GPU (RTX 5050, Blackwell) ушла в deep suspend и перестала просыпаться:
- `nvidia-smi` → "No devices were found"
- `/dev/nvidia0` → I/O error при открытии
- `switcheroo-control` → `HasDualGpu: false`, видит только Intel
- `/dev/dri/` → только `card1` + `renderD128` (одна GPU вместо двух)
- GPU power state: `suspended`/`suspending`

**Причина:** closed-source модуль не поддерживает корректный runtime PM для Blackwell-архитектуры (RTX 50xx). NVIDIA рекомендует open kernel modules для новых GPU.

**Экран (i915) работает нормально** — Intel GPU полностью независима от NVIDIA.

---

## Следующий шаг: замена closed → open

### Что будет сделано
```bash
sudo apt install nvidia-driver-580-open
```

### Что удалится (3 пакета)
| Пакет | Что это | Кто зависит |
|-------|---------|------------|
| `nvidia-driver-580` | Мета-пакет closed | Никто (nvidia-utils-580 не имеет hard depends на него) |
| `nvidia-dkms-580` | DKMS closed | Только nvidia-driver-580 (удаляется вместе) |
| `nvidia-kernel-source-580` | Исходники closed | Только nvidia-dkms-580 (удаляется вместе) |

### Что установится (3 пакета)
| Пакет | Что это |
|-------|---------|
| `nvidia-driver-580-open` | Мета-пакет open (якорь для userspace) |
| `nvidia-dkms-580-open` | DKMS open |
| `nvidia-kernel-source-580-open` | Исходники open |

### Что НЕ затрагивается (19 пакетов)
Все userspace-библиотеки (`libnvidia-*`), утилиты (`nvidia-utils-580`, `nvidia-smi`), Xorg-драйвер (`xserver-xorg-video-nvidia-580`), `nvidia-settings`, `nvidia-prime`, firmware, а также `xserver-xorg-video-intel`, `xserver-xorg-core`, `gdm3` — ничего из этого не удаляется и не модифицируется.

---

## Анализ рисков замены closed → open

### Проверено: экран (i915) не может сломаться

- `i915` depends: `drm_display_helper, ttm, video, drm_buddy, cec, i2c-algo-bit` — **никакой зависимости от NVIDIA**
- `xserver-xorg-video-intel` — не зависит от NVIDIA
- `xserver-xorg-core` — не зависит от NVIDIA
- `gdm3` — не зависит от NVIDIA
- `10-nvidia.conf` использует `MatchDriver "nvidia-drm"` — если NVIDIA-модуль не загрузится, Xorg просто **пропустит** эту секцию и будет работать через Intel
- `10-nvidia.conf` принадлежит `xserver-xorg-video-nvidia-580` — **не удаляется**

### Проверено: зависимости удаляемых пакетов

- `nvidia-utils-580` (содержит `nvidia-smi`) — hard depends: `nvidia-kernel-common-580`, `libc6`, `libnvidia-compute-580`. **Ни один не удаляется.** Связь с `nvidia-driver-580` через Breaks/Replaces, не через Depends.
- Симуляция удаления только 3 пакетов без установки новых: apt согласился, **не потащил** за собой ничего дополнительного
- `autoremove --simulate` после установки: **0 to remove**

### Три уровня fallback для NVIDIA-модулей

| Приоритет | Расположение | Тип | Владелец пакета | vermagic |
|-----------|-------------|-----|----------------|----------|
| 1 (высший) | `/updates/dkms/` | DKMS-скомпилированный open | nvidia-dkms-580-open | 6.17.0-14-generic SMP preempt mod_unload modversions |
| 2 | `/kernel/nvidia-580-open/` | Pre-built open | linux-modules-nvidia-580-open-6.17.0-14-generic | 6.17.0-14-generic SMP preempt mod_unload modversions |
| 3 | `/kernel/nvidia-580/` | Pre-built closed | linux-modules-nvidia-580-6.17.0-14-generic | 6.17.0-14-generic SMP preempt mod_unload modversions |

Все три имеют одинаковый `vermagic` — совместимы с ядром `6.17.0-14-generic`.
Пакеты-владельцы pre-built модулей (уровни 2 и 3) **не удаляются** этой операцией.
Если DKMS-компиляция провалится, `depmod` подхватит pre-built модули.

### Предпосылки для DKMS-компиляции (проверены)

| Требование | Статус |
|-----------|--------|
| `linux-headers-6.17.0-14-generic` | Установлен |
| `gcc 13.3.0` | Установлен |
| `make 4.3` | Установлен |
| `dkms` | Установлен |
| Диск `/boot` | 1.7 GB свободно |
| Диск `/` | 839 GB свободно |

### Таблица рисков

| Сценарий | Экран (i915) | NVIDIA GPU | Как чинить |
|----------|-------------|------------|------------|
| Всё ок (основной) | Работает | Работает через DKMS open | — |
| DKMS не скомпилировал | Работает | Fallback на pre-built open | — |
| Pre-built open не грузится | Работает | Fallback на pre-built closed | — |
| Все 3 варианта модулей отказали | **Работает** | Не работает | `sudo apt install --reinstall nvidia-driver-580-open` |
| apt прерван посреди операции | **Работает** | Pre-built fallback | `sudo dpkg --configure -a` |
| Suspend/Resume глюк | Требует reboot | Неизвестно | Перезагрузка |

---

## Уроки

1. После удаления ядра **всегда** проверяй `apt autoremove --simulate` перед реальным `autoremove` — удаление ядра может каскадно пометить как «сирот» пакеты, которые реально нужны.
2. Для новых GPU (Blackwell / RTX 50xx) использовать **`nvidia-driver-580-open`**, а не `nvidia-driver-580` — closed-source модуль не поддерживает runtime PM.
3. При замене мета-пакета NVIDIA возвращать **тот же тип** (open → open), а не менять на другой.
