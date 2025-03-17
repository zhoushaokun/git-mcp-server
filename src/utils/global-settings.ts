/**
 * Global Settings Utility
 * ======================
 * 
 * Provides global settings for the Git MCP server.
 * These settings can be used across different tools and services.
 */

/**
 * Global settings singleton for storing app-wide configuration
 */
export class GlobalSettings {
  private static instance: GlobalSettings;
  private _globalWorkingDir: string | null = null;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): GlobalSettings {
    if (!GlobalSettings.instance) {
      GlobalSettings.instance = new GlobalSettings();
    }
    return GlobalSettings.instance;
  }

  /**
   * Get the global working directory if set
   */
  public get globalWorkingDir(): string | null {
    return this._globalWorkingDir;
  }

  /**
   * Set the global working directory
   * 
   * @param path - Path to use as global working directory
   */
  public setGlobalWorkingDir(path: string | null): void {
    this._globalWorkingDir = path;
  }
}

/**
 * Helper function to get global settings instance
 */
export function getGlobalSettings(): GlobalSettings {
  return GlobalSettings.getInstance();
}