/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as KeyboardManager from 'resource:///org/gnome/shell/misc/keyboardManager.js';
import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const SWITCH_SHORTCUT_NAME = 'switch-input-source'
const SWITCH_SHORTCUT_NAME_BACKWARD = 'switch-input-source-backward'
const GRAB_RELEASE_TIMEOUT_MS = 200;
// const LOG_PREFIX = '[QLS-DEBUG]';

let _grabActor = null;
let _grabTimeoutId = 0;

export default class QuickLangSwitchExtension extends Extension {
    enable() {
        // console.log(`${LOG_PREFIX} enable() called`);
        const sourceman = getInputSourceManager();

        _grabActor = new Clutter.Actor({ reactive: true });
        Main.layoutManager.uiGroup.add_child(_grabActor);
        // console.log(`${LOG_PREFIX} grabActor created and added to uiGroup`);

        Main.wm.removeKeybinding(SWITCH_SHORTCUT_NAME);
        sourceman._keybindingAction = Main.wm.addKeybinding(
            SWITCH_SHORTCUT_NAME,
            new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings" }),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            this._quickSwitchLayouts.bind(sourceman));

        Main.wm.removeKeybinding(SWITCH_SHORTCUT_NAME_BACKWARD);
        sourceman._keybindingActionBackward = Main.wm.addKeybinding(
            SWITCH_SHORTCUT_NAME_BACKWARD,
            new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings" }),
            Meta.KeyBindingFlags.IS_REVERSED,
            Shell.ActionMode.ALL,
            this._quickSwitchLayouts.bind(sourceman));

        // console.log(`${LOG_PREFIX} enable() done, keybindings registered`);
    }

    disable() {
        // console.log(`${LOG_PREFIX} disable() called`);
        const sourceman = getInputSourceManager();

        if (_grabTimeoutId) {
            GLib.source_remove(_grabTimeoutId);
            _grabTimeoutId = 0;
        }

        if (_grabActor) {
            Main.layoutManager.uiGroup.remove_child(_grabActor);
            _grabActor.destroy();
            _grabActor = null;
        }

        Main.wm.removeKeybinding(SWITCH_SHORTCUT_NAME);
        sourceman._keybindingAction = Main.wm.addKeybinding(
            SWITCH_SHORTCUT_NAME,
            new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings" }),
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            sourceman._switchInputSource.bind(sourceman));

        Main.wm.removeKeybinding(SWITCH_SHORTCUT_NAME_BACKWARD);
        sourceman._keybindingActionBackward = Main.wm.addKeybinding(
            SWITCH_SHORTCUT_NAME_BACKWARD,
            new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings" }),
            Meta.KeyBindingFlags.IS_REVERSED,
            Shell.ActionMode.ALL,
            sourceman._switchInputSource.bind(sourceman));
    }

    _quickSwitchLayouts(...args) {
        // console.log(`${LOG_PREFIX} _quickSwitchLayouts() ENTER`);

        const binding = args[args.length-1];
        const sources = this._inputSources;
        const nsources = Object.keys(sources).length;
        // console.log(`${LOG_PREFIX} nsources=${nsources}, _grabActor=${!!_grabActor}`);

        if (nsources === 0) {
            // console.log(`${LOG_PREFIX} no sources, releasing keyboard`);
            KeyboardManager.releaseKeyboard();
            return;
        }
        const dir = binding.is_reversed() ? -1 : 1;
        const ci = this._currentSource ? this._currentSource.index : 0;
        const ni = (ci + dir + nsources) % nsources;
        const nextSource = sources[ni];

        if (!nextSource) {
            // console.log(`${LOG_PREFIX} no nextSource at index ${ni}, releasing keyboard`);
            KeyboardManager.releaseKeyboard();
            return;
        }

        // console.log(`${LOG_PREFIX} switching: ${ci} -> ${ni}`);
        sources[ni].activate(true);
        // console.log(`${LOG_PREFIX} activate() done`);

        if (_grabActor) {
            if (_grabTimeoutId) {
                // console.log(`${LOG_PREFIX} clearing previous grab timeout`);
                GLib.source_remove(_grabTimeoutId);
                _grabTimeoutId = 0;
            }

            // console.log(`${LOG_PREFIX} calling global.stage.grab()...`);
            try {
                let grab = global.stage.grab(_grabActor);
                // let seatState = grab.get_seat_state();
                // console.log(`${LOG_PREFIX} grab OK, seatState=${seatState}, KEYBOARD=${Clutter.GrabState.KEYBOARD}, POINTER=${Clutter.GrabState.POINTER}, ALL=${Clutter.GrabState.ALL}`);

                _grabTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    GRAB_RELEASE_TIMEOUT_MS,
                    () => {
                        // console.log(`${LOG_PREFIX} timeout fired, calling grab.dismiss()`);
                        try {
                            grab.dismiss();
                            // console.log(`${LOG_PREFIX} grab.dismiss OK`);
                        } catch (e) {
                            console.error(`[QLS] grab.dismiss ERROR: ${e.message}`);
                        }
                        _grabTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
                // console.log(`${LOG_PREFIX} timeout scheduled (${GRAB_RELEASE_TIMEOUT_MS}ms)`);
            } catch (e) {
                console.error(`[QLS] grab ERROR: ${e.message}\n${e.stack}`);
            }
        }

        // console.log(`${LOG_PREFIX} _quickSwitchLayouts() EXIT`);
    }

    _log(logfunc, ...args) {
        logfunc(`${this.metadata.uuid}:`, ...args);
    }

    _info(...args) {
        this._log(console.log, ...args);
    }

    _warn(...args) {
        this._log(console.warn, ...args);
    }

    _error(...args) {
        this._log(console.error, ...args);
    }
}
