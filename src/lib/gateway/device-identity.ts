/**
 * Device Identity Management for openClaw Gateway Protocol
 *
 * This module handles Ed25519 key pair generation and management for device authentication.
 * Based on the official openClaw control-ui implementation.
 * Identity is persisted in SQLite via the Tauri backend.
 */

import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";
import { db } from "$lib/db";

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

/**
 * Base64 URL encoding (RFC 4648)
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

/**
 * Base64 URL decoding (RFC 4648)
 */
function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a fingerprint from a public key using SHA-256
 */
async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Generate a new Ed25519 key pair and device identity
 */
async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

/**
 * Load existing device identity from SQLite or create a new one
 */
export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const row = await db.identity.get();
    if (row && row.deviceId && row.publicKey && row.privateKey) {
      // Verify and potentially update deviceId
      const derivedId = await fingerprintPublicKey(base64UrlDecode(row.publicKey));
      if (derivedId !== row.deviceId) {
        const updated = { ...row, deviceId: derivedId };
        await db.identity.save(updated);
        return {
          deviceId: derivedId,
          publicKey: row.publicKey,
          privateKey: row.privateKey,
        };
      }
      return {
        deviceId: row.deviceId,
        publicKey: row.publicKey,
        privateKey: row.privateKey,
      };
    }
  } catch {
    // fall through to regenerate
  }

  // Generate new identity
  const identity = await generateIdentity();
  try {
    await db.identity.save({
      deviceId: identity.deviceId,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    });
  } catch (e) {
    console.error("Failed to save device identity to DB:", e);
  }
  return identity;
}

/**
 * Sign a payload with the device's private key
 */
export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}

/**
 * Build the payload string for device authentication signature
 */
export type DeviceAuthPayloadParams = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
  version?: "v1" | "v2";
};

export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === "v2") {
    base.push(params.nonce ?? "");
  }
  return base.join("|");
}

/**
 * Check if the current context supports crypto.subtle (secure context)
 */
export function isSecureContext(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}
