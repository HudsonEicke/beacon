import { describe, expect, it } from 'vitest';
import { isValidAvatarUrl, passwordSchema, profileSchema } from './UserSettingsDialog.schema';

describe('profileSchema', () =>
{
    it('accepts an empty display name and avatar, which reset them', () =>
    {
        expect(profileSchema.parse({ displayName: '  ', profileImageUrl: '' })).toEqual({ displayName: '', profileImageUrl: '' });
    });

    it('trims the avatar URL before checking it', () =>
    {
        expect(profileSchema.parse({ displayName: 'Alice', profileImageUrl: '  https://example.com/a.png  ' }).profileImageUrl).toBe('https://example.com/a.png');
    });

    it('rejects an avatar URL that is not http or https', () =>
    {
        expect(profileSchema.safeParse({ displayName: 'Alice', profileImageUrl: 'javascript:alert(1)' }).error?.issues[0])
            .toMatchObject({ path: ['profileImageUrl'], message: 'Enter a valid http or https URL' });
    });

    it('rejects a display name over 32 characters', () =>
    {
        expect(profileSchema.safeParse({ displayName: 'a'.repeat(33), profileImageUrl: '' }).error?.issues[0]?.path).toEqual(['displayName']);
    });
});

describe('passwordSchema', () =>
{
    const validValues = { currentPassword: 'oldpassword', newPassword: 'newpassword', confirmPassword: 'newpassword' };

    it('accepts valid values', () =>
    {
        expect(passwordSchema.safeParse(validValues).success).toBe(true);
    });

    it('reports mismatched passwords on confirmPassword', () =>
    {
        expect(passwordSchema.safeParse({ ...validValues, confirmPassword: 'other-password' }).error?.issues[0])
            .toMatchObject({ path: ['confirmPassword'], message: "Passwords don't match" });
    });

    it('rejects a new password equal to the current one', () =>
    {
        expect(passwordSchema.safeParse({ currentPassword: 'samepassword', newPassword: 'samepassword', confirmPassword: 'samepassword' }).error?.issues[0])
            .toMatchObject({ path: ['newPassword'], message: 'New password must be different from your current one' });
    });

    it('rejects a new password under 8 characters', () =>
    {
        expect(passwordSchema.safeParse({ ...validValues, newPassword: 'short', confirmPassword: 'short' }).error?.issues[0]?.path).toEqual(['newPassword']);
    });
});

describe('isValidAvatarUrl', () =>
{
    it('is false for an empty value so no broken image is shown', () =>
    {
        expect(isValidAvatarUrl('')).toBe(false);
    });

    it('is true for an https URL', () =>
    {
        expect(isValidAvatarUrl('https://example.com/a.png')).toBe(true);
    });
});
