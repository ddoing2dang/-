# Matto Android web updates (1.4.0+)

The signed Android app preserves the appassets.androidplatform.net origin and localStorage.
On cold launch it checks the public ddoing2dang/- main Git tree and downloads web/ at that immutable commit. The complete snapshot is activated only after all file hashes and required entry points match. Android-specific config is generated locally.

Changes committed to web/ are delivered without rebuilding Android. Keep this directory self-contained with the current compatible engine and data. A [skip ci] source-only commit still becomes available to apps. Native Java, permissions, signing, or application metadata changes require another APK installation.

The launch wait is limited to six seconds. If updates are slow, the last saved snapshot (or bundled app) opens. A completed background download is used at the next cold launch; the active session is never reloaded during editing. Network failures/rate limits keep the previous snapshot. Updates currently require fully closing and reopening the app, not merely returning from another app.

The remote feed for recommendation data remains independent. This updater does not install APKs or update desktop apps. Do not put credentials into web/; it is public application content.
