'use server';

import type { Json } from '@/types/database';
import { requireUser } from '@/lib/auth/session';
import {
  type UserProfilePatch,
  type UserRow,
  updateUserProfile,
  updateUserSettings,
} from '@/lib/db/users';
import { type ActionResult, err, ok, toActionError } from '@/actions/result';
import { cleanString } from '@/actions/validate';

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 32;
const MAX_URL_LENGTH = 2048;
const MAX_LANGUAGE_LENGTH = 16;
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'AED'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UpdateProfileInput {
  /** Retail display name. */
  name?: string;
  email?: string;
  phone?: string;
  /** Business only: public display name, synced to business_profiles. */
  displayName?: string;
  /** Business only. */
  legalName?: string;
  /** Business only: public logo URL, synced to business_profiles. */
  logoUrl?: string;
}

export interface UpdateSettingsInput {
  currency?: string;
  darkMode?: boolean;
  language?: string;
  /** Notification toggles, e.g. { securityAlerts: true }. */
  preferences?: Record<string, boolean>;
}

export async function getMyProfile(): Promise<ActionResult<UserRow>> {
  try {
    const { user } = await requireUser();
    return ok(user);
  } catch (error) {
    return toActionError(error, 'profile.getMyProfile');
  }
}

/**
 * Whitelisted profile update. Retail fields (name, email, phone) are open to
 * everyone; business projection fields require a business account. Display
 * name and logo changes are synced to business_profiles by the repository.
 */
export async function updateProfile(
  input: UpdateProfileInput,
): Promise<ActionResult<UserRow>> {
  try {
    const { user } = await requireUser();

    const wantsBusinessFields =
      input.displayName !== undefined ||
      input.legalName !== undefined ||
      input.logoUrl !== undefined;
    if (wantsBusinessFields && user.type !== 'business') {
      return err('forbidden', 'Business profile fields require a business account');
    }

    const patch: UserProfilePatch = {};

    if (input.name !== undefined) {
      const name = cleanString(input.name, MAX_NAME_LENGTH);
      if (!name) {
        return err('invalid_input', 'Name must be a non-empty string');
      }
      patch.name = name;
    }
    if (input.email !== undefined) {
      const email = cleanString(input.email, MAX_EMAIL_LENGTH);
      if (!email || !EMAIL_PATTERN.test(email)) {
        return err('invalid_input', 'Email address is not valid');
      }
      patch.email = email;
    }
    if (input.phone !== undefined) {
      const phone = cleanString(input.phone, MAX_PHONE_LENGTH);
      if (!phone) {
        return err('invalid_input', 'Phone number is not valid');
      }
      patch.phone = phone;
    }
    if (input.displayName !== undefined) {
      const displayName = cleanString(input.displayName, MAX_NAME_LENGTH);
      if (!displayName) {
        return err('invalid_input', 'Display name must be a non-empty string');
      }
      patch.display_name = displayName;
    }
    if (input.legalName !== undefined) {
      const legalName = cleanString(input.legalName, MAX_NAME_LENGTH);
      if (!legalName) {
        return err('invalid_input', 'Legal name must be a non-empty string');
      }
      patch.legal_name = legalName;
    }
    if (input.logoUrl !== undefined) {
      const logoUrl = cleanString(input.logoUrl, MAX_URL_LENGTH);
      if (!logoUrl || !/^https:\/\//.test(logoUrl)) {
        return err('invalid_input', 'Logo URL must be an https URL');
      }
      patch.logo_url = logoUrl;
    }

    if (Object.keys(patch).length === 0) {
      return err('invalid_input', 'Nothing to update');
    }

    const updated = await updateUserProfile(user.id, patch);
    return ok(updated);
  } catch (error) {
    return toActionError(error, 'profile.updateProfile');
  }
}

/**
 * Merges the given settings into users.settings. Unknown keys are rejected;
 * preference toggles are merged shallowly so partial saves keep the rest.
 */
export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<ActionResult<UserRow>> {
  try {
    const { user } = await requireUser();

    const patch: Record<string, Json> = {};

    if (input.currency !== undefined) {
      if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
        return err(
          'invalid_input',
          `Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}`,
        );
      }
      patch.currency = input.currency;
    }
    if (input.darkMode !== undefined) {
      if (typeof input.darkMode !== 'boolean') {
        return err('invalid_input', 'darkMode must be a boolean');
      }
      patch.darkMode = input.darkMode;
    }
    if (input.language !== undefined) {
      const language = cleanString(input.language, MAX_LANGUAGE_LENGTH);
      if (!language) {
        return err('invalid_input', 'Language is not valid');
      }
      patch.language = language;
    }

    const current =
      user.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
        ? (user.settings as Record<string, Json>)
        : {};

    if (input.preferences !== undefined) {
      if (
        typeof input.preferences !== 'object' ||
        input.preferences === null ||
        Array.isArray(input.preferences)
      ) {
        return err('invalid_input', 'preferences must be an object of booleans');
      }
      const merged: Record<string, Json> = {};
      const existing = current.preferences;
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        Object.assign(merged, existing);
      }
      for (const [key, value] of Object.entries(input.preferences)) {
        if (typeof value !== 'boolean' || !cleanString(key, 64)) {
          return err('invalid_input', 'preferences must be an object of booleans');
        }
        merged[key] = value;
      }
      patch.preferences = merged;
    }

    if (Object.keys(patch).length === 0) {
      return err('invalid_input', 'Nothing to update');
    }

    const updated = await updateUserSettings(user.id, { ...current, ...patch });
    return ok(updated);
  } catch (error) {
    return toActionError(error, 'profile.updateSettings');
  }
}
