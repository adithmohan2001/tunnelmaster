const fs = require('fs').promises;
const path = require('path');
const CryptoJS = require('crypto-js');
const { v4: uuidv4 } = require('uuid');

class KeyStore {
  constructor(dataPath) {
    this.keysPath = path.join(dataPath, 'keys');
    this.keysInfoPath = path.join(dataPath, 'keys-info.json');
    this.keys = []; // Array of key metadata (without actual private key content)
    this._initialized = false;
  }
  
  /**
   * Initialize the key store
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;
    
    try {
      // Ensure keys directory exists
      await fs.mkdir(this.keysPath, { recursive: true });
      
      // Try to load keys info
      try {
        const data = await fs.readFile(this.keysInfoPath, 'utf8');
        this.keys = JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          // File doesn't exist yet, create empty array
          this.keys = [];
          await this._saveKeysInfo();
        } else {
          throw err;
        }
      }
      
      this._initialized = true;
    } catch (err) {
      console.error('Failed to initialize key store:', err);
      throw err;
    }
  }
  
  /**
   * Save keys info to file
   * @returns {Promise<void>}
   * @private
   */
  async _saveKeysInfo() {
    await fs.writeFile(this.keysInfoPath, JSON.stringify(this.keys, null, 2));
  }
  
  /**
   * Add a new SSH key
   * @param {string} name - Name of the key
   * @param {string} keyContent - Content of the private key
   * @param {string} passphrase - Optional passphrase for the key
   * @returns {Promise<object>} - Metadata about the added key
   */
  async addKey(name, keyContent, passphrase = null) {
    await this.initialize();
    
    // Generate ID for the key
    const keyId = uuidv4();
    
    // Encrypt the key content
    const encryptedKey = this._encryptKey(keyContent);
    
    // Save encrypted key to file
    const keyPath = path.join(this.keysPath, `${keyId}.key`);
    await fs.writeFile(keyPath, encryptedKey);
    
    // Set file permissions to read/write for owner only
    try {
      await fs.chmod(keyPath, 0o600);
    } catch (err) {
      console.warn('Could not set file permissions for key file:', err);
    }
    
    // Create key metadata
    const keyInfo = {
      id: keyId,
      name: name,
      createdAt: new Date(),
      hasPassphrase: passphrase !== null,
      path: keyPath
    };
    
    // Save passphrase if provided
    if (passphrase) {
      const encryptedPassphrase = this._encryptKey(passphrase);
      const passphrasePath = path.join(this.keysPath, `${keyId}.passphrase`);
      await fs.writeFile(passphrasePath, encryptedPassphrase);
      
      // Set file permissions to read/write for owner only
      try {
        await fs.chmod(passphrasePath, 0o600);
      } catch (err) {
        console.warn('Could not set file permissions for passphrase file:', err);
      }
    }
    
    // Add to keys array
    this.keys.push(keyInfo);
    
    // Save keys info
    await this._saveKeysInfo();
    
    return keyInfo;
  }
  
  /**
   * Get a key by ID
   * @param {string} keyId - ID of the key
   * @returns {Promise<object|null>} - Key metadata or null if not found
   */
  async getKey(keyId) {
    await this.initialize();
    
    // Find key in keys array
    const keyInfo = this.keys.find(key => key.id === keyId);
    if (!keyInfo) return null;
    
    return keyInfo;
  }
  
  /**
   * Get all keys
   * @returns {Promise<Array<object>>} - Array of key metadata
   */
  async getAllKeys() {
    await this.initialize();
    return [...this.keys];
  }
  
  /**
   * Get the decrypted content of a key
   * @param {string} keyId - ID of the key
   * @returns {Promise<string>} - Decrypted key content
   */
  async getKeyContent(keyId) {
    await this.initialize();
    
    // Find key in keys array
    const keyInfo = this.keys.find(key => key.id === keyId);
    if (!keyInfo) {
      throw new Error(`Key with ID ${keyId} not found`);
    }
    
    // Read encrypted key from file
    const encryptedKey = await fs.readFile(keyInfo.path, 'utf8');
    
    // Decrypt key
    return this._decryptKey(encryptedKey);
  }
  
  /**
   * Get the passphrase for a key
   * @param {string} keyId - ID of the key
   * @returns {Promise<string|null>} - Decrypted passphrase or null if not found
   */
  async getKeyPassphrase(keyId) {
    await this.initialize();
    
    // Find key in keys array
    const keyInfo = this.keys.find(key => key.id === keyId);
    if (!keyInfo || !keyInfo.hasPassphrase) {
      return null;
    }
    
    // Read encrypted passphrase from file
    const passphrasePath = path.join(this.keysPath, `${keyId}.passphrase`);
    try {
      const encryptedPassphrase = await fs.readFile(passphrasePath, 'utf8');
      
      // Decrypt passphrase
      return this._decryptKey(encryptedPassphrase);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
  
  /**
   * Delete a key
   * @param {string} keyId - ID of the key
   * @returns {Promise<boolean>} - Whether the key was found and deleted
   */
  async deleteKey(keyId) {
    await this.initialize();
    
    // Find key index
    const keyIndex = this.keys.findIndex(key => key.id === keyId);
    if (keyIndex === -1) return false;
    
    // Get key info
    const keyInfo = this.keys[keyIndex];
    
    // Delete key file
    try {
      await fs.unlink(keyInfo.path);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
    // Delete passphrase file if exists
    if (keyInfo.hasPassphrase) {
      const passphrasePath = path.join(this.keysPath, `${keyId}.passphrase`);
      try {
        await fs.unlink(passphrasePath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
    
    // Remove from keys array
    this.keys.splice(keyIndex, 1);
    
    // Save keys info
    await this._saveKeysInfo();
    
    return true;
  }
  
  /**
   * Encrypt a string
   * @param {string} text - Text to encrypt
   * @returns {string} - Encrypted text
   * @private
   */
  _encryptKey(text) {
    // Use a hardcoded key for simplicity
    // In a production app, you'd want to use a more secure key management strategy
    const encryptionKey = 'e4d26bdb-25d6-4d98-b8d5-2a9a942609f8';
    return CryptoJS.AES.encrypt(text, encryptionKey).toString();
  }
  
  /**
   * Decrypt a string
   * @param {string} encryptedText - Encrypted text
   * @returns {string} - Decrypted text
   * @private
   */
  _decryptKey(encryptedText) {
    // Use the same hardcoded key as for encryption
    const encryptionKey = 'e4d26bdb-25d6-4d98-b8d5-2a9a942609f8';
    const bytes = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}

module.exports = KeyStore;