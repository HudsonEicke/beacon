import { describe, expect, it } from 'vitest';
import { registerSchema } from './RegisterForm.schema';

const validValues = {
    username: 'alice',
    email: 'alice@example.com',
    password: 'password123',
    confirmPassword: 'password123'
};

const errorsFor = (values: object) =>
{
    const result = registerSchema.safeParse(values);

    return result.success ? {} : Object.fromEntries(result.error.issues.map(issue => [issue.path.join('.'), issue.message]));
};

describe('registerSchema', () =>
{
    it('accepts valid values', () =>
    {
        expect(registerSchema.safeParse(validValues).success).toBe(true);
    });

    it('reports mismatched passwords on confirmPassword', () =>
    {
        expect(errorsFor({ ...validValues, confirmPassword: 'different1' })).toEqual({ confirmPassword: "Passwords don't match" });
    });

    it.each([
        ['username', '', 'Username is required'],
        ['username', 'a'.repeat(33), 'Username must be 32 characters or fewer'],
        ['email', 'not-an-email', 'Enter a valid email address'],
        ['password', 'short', 'Password must be at least 8 characters']
    ])('rejects %s "%s"', (field, value, message) =>
    {
        const values = { ...validValues, [field]: value, confirmPassword: field === 'password' ? value : validValues.confirmPassword };

        expect(errorsFor(values)[field]).toBe(message);
    });
});
