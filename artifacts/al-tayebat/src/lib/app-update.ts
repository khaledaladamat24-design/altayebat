import { Capacitor } from "@capacitor/core";

// Google Play in-app update. Runs only inside the native Android shell — on the
// web preview there is no Play Store to talk to, so this is a no-op. We prefer
// an immediate (blocking) update when Play allows it because vendors must stay
// on the latest build to receive new-order pushes correctly; otherwise we fall
// back to a flexible (background) update. Any failure is swallowed so a Play
// hiccup never blocks the app from starting.
export async function checkForAppUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }
  try {
    const { AppUpdate, AppUpdateAvailability, FlexibleUpdateInstallStatus } =
      await import("@capawesome/capacitor-app-update");

    const info = await AppUpdate.getAppUpdateInfo();
    if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
      return;
    }

    if (info.immediateUpdateAllowed) {
      await AppUpdate.performImmediateUpdate();
      return;
    }

    if (info.flexibleUpdateAllowed) {
      await AppUpdate.startFlexibleUpdate();
      const handle = await AppUpdate.addListener(
        "onFlexibleUpdateStateChange",
        async (state) => {
          if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
            await handle.remove();
            await AppUpdate.completeFlexibleUpdate();
          }
        },
      );
    }
  } catch {
    // Play unavailable / sideloaded build / network error — ignore.
  }
}
