import { backups } from "@budibase/pro"
import { objectStore, tenancy } from "@budibase/backend-core"
import { AppBackupQueueData } from "@budibase/types"
import { exportApp } from "./exports"
import { Job } from "bull"
import fs from "fs"
import env from "../../../environment"

async function importProcessor(job: Job) {
  const data: AppBackupQueueData = job.data
  const appId = data.appId,
    backupId = data.import!.backupId
  const { path, metadata } = await backups.downloadAppBackup(backupId)
}

async function exportProcessor(job: Job) {
  const data: AppBackupQueueData = job.data
  const appId = data.appId,
    trigger = data.export!.trigger,
    name = data.export!.name
  const tenantId = tenancy.getTenantIDFromAppID(appId)
  await tenancy.doInTenant(tenantId, async () => {
    const createdAt = new Date().toISOString()
    const tarPath = await exportApp(appId, { tar: true })
    let filename = `${appId}/backup-${createdAt}.tar.gz`
    // add the tenant to the bucket path if backing up within a multi-tenant environment
    if (env.MULTI_TENANCY) {
      filename = `${tenantId}/${filename}`
    }
    const bucket = objectStore.ObjectStoreBuckets.BACKUPS
    const metadata = {
      appId,
      createdAt,
      trigger,
      name,
    }
    await objectStore.upload({
      path: tarPath,
      type: "application/gzip",
      bucket,
      filename,
      metadata,
    })
    await backups.storeAppBackupMetadata(filename, metadata)
    // clear up the tarball after uploading it
    fs.rmSync(tarPath)
  })
}

export async function init() {
  await backups.addAppBackupProcessors(importProcessor, exportProcessor)
}
