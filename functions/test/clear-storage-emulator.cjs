const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getStorage} = require("firebase-admin/storage");

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || "demo-feasta-phase3";
  const app = initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  }, `storage-reset-${Date.now()}`);

  try {
    const [files] = await getStorage(app).bucket().getFiles();

    // Delete objects rather than the bucket itself. The Storage emulator
    // implements object operations but intentionally does not implement the
    // Cloud Storage bucket deletion API.
    for (let offset = 0; offset < files.length; offset += 25) {
      await Promise.all(
        files.slice(offset, offset + 25).map((file) =>
          file.delete({ignoreNotFound: true}),
        ),
      );
    }

    console.log(`Cleared ${files.length} Storage emulator object(s).`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
