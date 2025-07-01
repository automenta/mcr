const fs = require('fs');
const { logger } = require('./logger');
const ApiError = require('./errors');

const storageUtils = {
  ensurePathExists(pathToEnsure, type) {
    if (!fs.existsSync(pathToEnsure)) {
      try {
        fs.mkdirSync(pathToEnsure, { recursive: true });
        logger.info(`Created ${type} storage directory: ${pathToEnsure}`);
      } catch (error) {
        logger.error(
          `Failed to create ${type} storage directory ${pathToEnsure}: ${error.message}`,
          {
            internalErrorCode: `${type.toUpperCase()}_STORAGE_MKDIR_FAILED`,
            path: pathToEnsure,
            originalError: error.message,
            stack: error.stack,
          }
        );
        throw new ApiError(
          500,
          `Failed to create necessary storage directory for ${type}: ${error.message}`,
          `${type.toUpperCase()}_STORAGE_SETUP_FAILED`
        );
      }
    }
  },

  saveJsonFile(filePath, data, type, id) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      logger.debug(`${type} ${id} saved to ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to save ${type} ${id} to ${filePath}. Error: ${error.message} (Code: ${error.code}, Errno: ${error.errno})`,
        {
          internalErrorCode: `${type.toUpperCase()}_SAVE_FAILED`,
          id,
          filePath,
          originalError: error.message,
          errorCode: error.code,
          errno: error.errno,
          stack: error.stack,
        }
      );
      throw new ApiError(
        500,
        `Failed to save ${type} ${id}: ${error.message} (FS Code: ${error.code})`,
        `${type.toUpperCase()}_SAVE_OPERATION_FAILED`
      );
    }
  },

  loadJsonFile(filePath, type, id) {
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(fileData);
        logger.debug(`${type} ${id} loaded from ${filePath}`);
        return jsonData;
      } catch (error) {
        logger.error(
          `Failed to load or parse ${type} ${id} from ${filePath}.`,
          {
            internalErrorCode: `${type.toUpperCase()}_LOAD_PARSE_FAILED`,
            id,
            filePath,
            originalError: error.message,
            stack: error.stack,
          }
        );
        throw new ApiError(
          500,
          `Failed to read or parse ${type} file ${id}: ${error.message}`,
          `${type.toUpperCase()}_DATA_CORRUPT_OR_UNREADABLE`
        );
      }
    }
    return null;
  },

  saveRawFile(filePath, data, type, id) {
    try {
      fs.writeFileSync(filePath, data);
      logger.debug(`${type} ${id} saved to ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to save ${type} ${id} to ${filePath}: ${error.message}`,
        {
          internalErrorCode: `${type.toUpperCase()}_SAVE_RAW_FAILED`,
          id,
          filePath,
          originalError: error.message,
          stack: error.stack,
        }
      );
      throw new ApiError(
        500,
        `Failed to save ${type} ${id}: ${error.message}`,
        `${type.toUpperCase()}_SAVE_RAW_OPERATION_FAILED`
      );
    }
  },

  loadRawFile(filePath, type, id) {
    if (fs.existsSync(filePath)) {
      try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        logger.debug(`${type} ${id} loaded from ${filePath}`);
        return fileData;
      } catch (error) {
        logger.error(`Failed to load ${type} ${id} from ${filePath}.`, {
          internalErrorCode: `${type.toUpperCase()}_LOAD_RAW_FAILED`,
          id,
          filePath,
          originalError: error.message,
          stack: error.stack,
        });
        throw new ApiError(
          500,
          `Failed to read ${type} file ${id}: ${error.message}`,
          `${type.toUpperCase()}_RAW_DATA_UNREADABLE`
        );
      }
    }
    return null;
  },

  deleteFile(filePath, type, id) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug(`${type} file ${id} (${filePath}) deleted.`);
      } catch (error) {
        logger.error(
          `Failed to delete ${type} file ${id} (${filePath}): ${error.message}`,
          {
            internalErrorCode: `${type.toUpperCase()}_FILE_DELETE_ERROR`,
            id,
            filePath,
            originalError: error.message,
          }
        );
        throw new ApiError(
          500,
          `Failed to delete ${type} file ${filePath}: ${error.message}`,
          `${type.toUpperCase()}_FILE_DELETE_FAILED`
        );
      }
    }
  },

  readDir(directoryPath, type) {
    try {
      return fs.readdirSync(directoryPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(
          `${type} directory ${directoryPath} not found. Returning empty list.`
        );
        return [];
      }
      logger.error(
        `Failed to read ${type} directory ${directoryPath}: ${error.message}`,
        {
          internalErrorCode: `${type.toUpperCase()}_READDIR_FAILED`,
          path: directoryPath,
          originalError: error.message,
          stack: error.stack,
        }
      );
      throw new ApiError(
        500,
        `Failed to read ${type} directory ${directoryPath}: ${error.message}`,
        `${type.toUpperCase()}_DIRECTORY_UNREADABLE`
      );
    }
  },
};

module.exports = storageUtils;
