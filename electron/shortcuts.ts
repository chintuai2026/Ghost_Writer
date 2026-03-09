import { globalShortcut, app, BrowserWindow } from "electron"
import { AppState } from "./main" // Adjust the import path if necessary

export class ShortcutsHelper {
  private appState: AppState
  private activeScreenshotShortcut: string = "CommandOrControl+H"

  constructor(appState: AppState) {
    this.appState = appState
  }

  public getActiveScreenshotShortcut(): string {
    return this.activeScreenshotShortcut
  }

  public registerGlobalShortcuts(): void {
    const registerShortcut = (
      accelerator: string,
      handler: () => void | Promise<void>,
      label: string
    ): boolean => {
      globalShortcut.register(accelerator, handler)
      const registered = globalShortcut.isRegistered(accelerator)

      if (!registered) {
        console.warn(`[Shortcuts] Failed to register ${label} (${accelerator})`)
      }

      return registered
    }

    // Add global shortcut to show/center window
    registerShortcut("CommandOrControl+Shift+Space", () => {
      // console.log("Show/Center window shortcut pressed...")
      this.appState.centerAndShowWindow()
    }, "show window")

    // Screenshot shortcut — try Ctrl+H first, fall back to Ctrl+Shift+H if it's taken
    const screenshotHandler = async () => {
      console.log("[Shortcuts] Screenshot shortcut pressed — taking screenshot...")
      try {
        const screenshotPath = await this.appState.takeScreenshot()
        console.log("[Shortcuts] Screenshot saved:", screenshotPath)
        const preview = await this.appState.getImagePreview(screenshotPath)

        // Small delay so the re-shown window is fully ready to receive events
        await new Promise(resolve => setTimeout(resolve, 150))

        // Broadcast to ALL windows – ensures delivery regardless of overlay vs launcher mode
        const windowHelper = this.appState.getWindowHelper()
        const wins = [
          windowHelper.getLauncherWindow(),
          windowHelper.getOverlayWindow()
        ]
        let sent = 0
        for (const win of wins) {
          if (win && !win.isDestroyed()) {
            win.webContents.send("screenshot-taken", { path: screenshotPath, preview })
            sent++
          }
        }
        console.log(`[Shortcuts] screenshot-taken event sent to ${sent} window(s)`)
      } catch (error) {
        console.error("[Shortcuts] Error capturing screenshot:", error)
      }
    }

    const tryRegister = (accelerator: string): boolean => {
      return registerShortcut(accelerator, screenshotHandler, "screenshot")
    }

    if (tryRegister("CommandOrControl+H")) {
      this.activeScreenshotShortcut = "CommandOrControl+H"
      console.log("[Shortcuts] ✅ Ctrl+H registered as screenshot shortcut")
    } else if (tryRegister("CommandOrControl+Shift+H")) {
      this.activeScreenshotShortcut = "CommandOrControl+Shift+H"
      console.warn("[Shortcuts] ⚠️ Ctrl+H unavailable — registered Ctrl+Shift+H instead")
    } else if (tryRegister("CommandOrControl+Alt+H")) {
      this.activeScreenshotShortcut = "CommandOrControl+Alt+H"
      console.warn("[Shortcuts] ⚠️ Ctrl+H and Ctrl+Shift+H unavailable — registered Ctrl+Alt+H instead")
    } else {
      this.activeScreenshotShortcut = "Unbound"
      console.error("[Shortcuts] ❌ Failed to register any screenshot shortcut (Ctrl+H family). They are all taken by your OS.")
    }




    registerShortcut("CommandOrControl+Enter", async () => {
      await this.appState.processingHelper.processScreenshots()
    }, "process screenshots")

    registerShortcut("CommandOrControl+R", () => {
      // console.log(
      //   "Command + R pressed. Canceling requests and resetting queues..."
      // )

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests()

      // Clear both screenshot queues
      this.appState.clearQueues()

      // console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.appState.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    }, "reset session")

    // New shortcuts for moving the window
    registerShortcut("CommandOrControl+Left", () => {
      // console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.appState.moveWindowLeft()
    }, "move window left")

    registerShortcut("CommandOrControl+Right", () => {
      // console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.appState.moveWindowRight()
    }, "move window right")
    registerShortcut("CommandOrControl+Down", () => {
      // console.log("Command/Ctrl + down pressed. Moving window down.")
      this.appState.moveWindowDown()
    }, "move window down")
    registerShortcut("CommandOrControl+Up", () => {
      // console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.appState.moveWindowUp()
    }, "move window up")

    registerShortcut("CommandOrControl+B", () => {
      this.handleToggleVisibility();
    }, "toggle visibility");

    // Alt+G: Alias for Toggle Visibility
    registerShortcut("Alt+G", () => {
      this.handleToggleVisibility();
    }, "toggle visibility alias");

    // F8: "What to answer" / Ask AI
    registerShortcut("F8", async () => {
      await this.handleQuickAnswer();
    }, "quick answer");

    // Ctrl+J: Legacy alias for Quick Answer
    registerShortcut("CommandOrControl+J", async () => {
      await this.handleQuickAnswer();
    }, "quick answer alias");

    // F9: Start/Stop transcription (Toggle Meeting)
    registerShortcut("F9", async () => {
      if (this.appState.getIsMeetingActive()) {
        await this.appState.endMeeting();
      } else {
        await this.appState.startMeeting();
      }
    }, "toggle meeting");

    // Alt+C: Reset/Cancel (Alias for Cmd+R)
    registerShortcut("Alt+C", () => {
      this.handleResetSession();
    }, "reset session alias");

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }

  private async handleQuickAnswer(): Promise<void> {
    const windowHelper = this.appState.getWindowHelper();
    const candidateWindows = [
      windowHelper.getMainWindow(),
      windowHelper.getLauncherWindow(),
      windowHelper.getOverlayWindow()
    ].filter((window, index, windows): window is BrowserWindow => {
      return !!window && !window.isDestroyed() && windows.indexOf(window) === index;
    });

    for (const window of candidateWindows) {
      window.webContents.send('quick-answer');
    }

    try {
      await this.appState.getIntelligenceManager().runWhatShouldISay();
    } catch (err) {
      console.error('[Shortcuts] Quick answer failed:', err);
    }
  }

  private handleToggleVisibility(): void {
    const windowHelper = this.appState.getWindowHelper()
    const overlayWindow = windowHelper.getOverlayWindow()
    const launcherWindow = windowHelper.getLauncherWindow()
    const currentMode = windowHelper.getCurrentWindowMode()
    const focusedWindow = BrowserWindow.getFocusedWindow()

    if (focusedWindow && launcherWindow && focusedWindow.id === launcherWindow.id) {
      launcherWindow.hide()
      return
    }

    if (focusedWindow && overlayWindow && focusedWindow.id === overlayWindow.id) {
      overlayWindow.webContents.send('toggle-expand')
      return
    }

    if (currentMode === 'overlay' && overlayWindow) {
      overlayWindow.webContents.send('toggle-expand')
    } else if (launcherWindow) {
      if (launcherWindow.isVisible()) {
        launcherWindow.hide()
      } else {
        launcherWindow.show()
        launcherWindow.focus()
      }
    }
  }

  private handleResetSession(): void {
    this.appState.processingHelper.cancelOngoingRequests()
    this.appState.clearQueues()
    this.appState.setView("queue")
    const mainWindow = this.appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-view")
    }
  }
}
