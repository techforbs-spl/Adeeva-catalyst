const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');

/**
 * Test connection to FTP server
 */
async function testFtpConnection(config) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.host,
      port: config.port ? parseInt(config.port, 10) : 21,
      user: config.user || 'anonymous',
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true' || config.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });
    
    const targetDir = config.remoteDir || '/';
    // Optionally check if remote directory exists or can be navigated to
    if (config.remoteDir && config.remoteDir !== '/' && config.remoteDir !== '.') {
      await client.ensureDir(config.remoteDir);
    }
    
    const list = await client.list();
    client.close();
    return { 
      success: true, 
      targetDir,
      itemCount: list.length,
      message: `Connected successfully! Target folder: ${targetDir} (Found ${list.length} items in remote directory).` 
    };
  } catch (err) {
    client.close();
    return { success: false, message: err.message || 'Failed to connect to FTP server.' };
  }
}

/**
 * Upload multiple files to FTP server
 */
async function uploadFilesToFtp(files, config) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  const results = [];

  try {
    await client.access({
      host: config.host,
      port: config.port ? parseInt(config.port, 10) : 21,
      user: config.user || 'anonymous',
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true' || config.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    if (config.remoteDir && config.remoteDir !== '/' && config.remoteDir !== '.') {
      await client.ensureDir(config.remoteDir);
    }

    for (const file of files) {
      const fileName = path.basename(file.filePath);
      try {
        await client.uploadFrom(file.filePath, fileName);
        results.push({
          fileName,
          status: 'success',
          sizeBytes: fs.statSync(file.filePath).size
        });
      } catch (uploadErr) {
        results.push({
          fileName,
          status: 'failed',
          error: uploadErr.message
        });
      }
    }

    client.close();
    const allSuccessful = results.every(r => r.status === 'success');
    return {
      success: allSuccessful,
      results,
      message: allSuccessful
        ? `Successfully uploaded ${results.length} files to FTP.`
        : 'Some files could not be uploaded.'
    };
  } catch (err) {
    client.close();
    return {
      success: false,
      results,
      message: `FTP Connection Error: ${err.message}`
    };
  }
}

/**
 * List files and directories at a specific FTP path
 */
async function listFtpDirectory(config, targetPath = '/') {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.host,
      port: config.port ? parseInt(config.port, 10) : 21,
      user: config.user || 'anonymous',
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true' || config.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    const cleanPath = targetPath.trim() || '/';
    if (cleanPath !== '/' && cleanPath !== '.') {
      await client.cd(cleanPath);
    }
    const currentDir = await client.pwd();
    const list = await client.list();
    client.close();

    const items = list
      .filter(item => item.name !== '.' && item.name !== '..')
      .map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        size: item.size,
        date: item.rawModifiedAt || (item.modifiedAt ? item.modifiedAt.toISOString() : '')
      }));

    // Sort directories first, then alphabetical
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      currentDir: currentDir || cleanPath,
      items
    };
  } catch (err) {
    client.close();
    return {
      success: false,
      message: err.message || 'Failed to list directory on FTP server.'
    };
  }
}

/**
 * Create a new directory on the FTP server
 */
async function createFtpDirectory(config, newDirPath) {
  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: config.host,
      port: config.port ? parseInt(config.port, 10) : 21,
      user: config.user || 'anonymous',
      password: config.password || '',
      secure: config.secure === true || config.secure === 'true' || config.secure === 'explicit',
      secureOptions: { rejectUnauthorized: false }
    });

    await client.ensureDir(newDirPath);
    client.close();
    return { success: true, message: `Directory '${newDirPath}' created successfully.` };
  } catch (err) {
    client.close();
    return { success: false, message: err.message || 'Failed to create directory.' };
  }
}

module.exports = {
  testFtpConnection,
  uploadFilesToFtp,
  listFtpDirectory,
  createFtpDirectory
};

