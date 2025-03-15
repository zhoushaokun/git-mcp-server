/**
 * Validation Utilities
 * ===================
 * 
 * Utilities for validating input parameters using Zod.
 */

import { z } from 'zod';
import path from 'path';

/**
 * Common validation schemas used throughout the server
 */
export const Schemas = {
  /**
   * Repository path validation
   */
  repoPath: z.string()
    .min(1, "Repository path is required")
    .transform(val => path.normalize(val)),
  
  /**
   * Commit validation
   */
  commit: {
    hash: z.string().regex(/^[0-9a-f]{4,40}$/, "Invalid commit hash format"),
    message: z.string().min(1, "Commit message is required"),
    author: z.object({
      name: z.string().optional(),
      email: z.string().email("Invalid email format").optional()
    }).optional(),
    date: z.date().optional(),
    allowEmpty: z.boolean().optional().default(false),
    amend: z.boolean().optional().default(false)
  },
  
  /**
   * Branch validation
   */
  branch: {
    name: z.string().min(1, "Branch name is required")
      .regex(/^[^\s]+$/, "Branch name cannot contain spaces"),
    checkout: z.boolean().optional().default(false),
    startPoint: z.string().optional()
  },
  
  /**
   * Remote validation
   */
  remote: {
    name: z.string().min(1, "Remote name is required"),
    url: z.string().url("Invalid URL format"),
    branch: z.string().optional()
  },
  
  /**
   * File validation
   */
  file: {
    path: z.string().min(1, "File path is required"),
    ref: z.string().optional().default('HEAD')
  },
  
  /**
   * Diff validation
   */
  diff: {
    fromRef: z.string().min(1, "Source reference is required"),
    toRef: z.string().optional().default('HEAD'),
    path: z.string().optional()
  },
  
  /**
   * Tag validation
   */
  tag: {
    name: z.string().min(1, "Tag name is required"),
    message: z.string().optional(),
    ref: z.string().optional()
  }
};

/**
 * Path validation helper functions
 */
export const PathValidation = {
  /**
   * Normalizes a path to ensure consistent format
   */
  normalizePath(inputPath: string): string {
    return path.normalize(inputPath);
  },
  
  /**
   * Validates if a path is within the allowed directory
   */
  isWithinDirectory(targetPath: string, basePath: string): boolean {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedBase = path.normalize(basePath);
    
    return normalizedTarget.startsWith(normalizedBase) &&
      normalizedTarget.length > normalizedBase.length;
  },
  
  /**
   * Joins and normalizes path components
   */
  joinPaths(...pathComponents: string[]): string {
    return path.normalize(path.join(...pathComponents));
  }
};