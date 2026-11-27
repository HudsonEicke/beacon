import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse } from 'axios';
import { getApiError, getErrorMessage, getInitials } from './utils';

const axiosErrorWith = (status: number, data: unknown) =>
{
    const response: AxiosResponse = { status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() } };

    return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
};

describe('getApiError', () =>
{
    it('uses the fallback for an error that is not from axios', () =>
    {
        expect(getApiError(new Error('boom'), 'Fallback')).toEqual({ message: 'Fallback' });
    });

    it('uses a plain string body as the message', () =>
    {
        expect(getApiError(axiosErrorWith(409, 'Username is taken'), 'Fallback')).toEqual({ status: 409, message: 'Username is taken' });
    });

    it('ignores a blank string body', () =>
    {
        expect(getApiError(axiosErrorWith(400, '   '), 'Fallback')).toEqual({ status: 400, message: 'Fallback' });
    });

    it('uses a message property', () =>
    {
        expect(getApiError(axiosErrorWith(403, { message: "You can't message this user" }), 'Fallback'))
            .toEqual({ status: 403, message: "You can't message this user" });
    });

    it('leads with the first field error and strips the $. prefix from keys', () =>
    {
        const data = {
            title: 'One or more validation errors occurred.',
            errors: {
                '$.displayName': ['Display name is too long'],
                Email: ['Email is invalid', 42]
            }
        };

        expect(getApiError(axiosErrorWith(400, data), 'Fallback')).toEqual({
            status: 400,
            message: 'Display name is too long',
            fieldErrors: {
                displayName: ['Display name is too long'],
                Email: ['Email is invalid']
            }
        });
    });

    it('uses the ProblemDetails title when there are no field errors', () =>
    {
        expect(getApiError(axiosErrorWith(404, { title: 'Not Found', errors: {} }), 'Fallback')).toEqual({ status: 404, message: 'Not Found' });
    });

    it('uses the fallback for an error with no response', () =>
    {
        expect(getApiError(new AxiosError('Network Error', 'ERR_NETWORK'), 'Fallback')).toEqual({ status: undefined, message: 'Fallback' });
    });
});

describe('getInitials', () =>
{
    it.each([
        ['Alice', 'A'],
        ['alice smith', 'AS'],
        ['  Alice   Mary Smith ', 'AM'],
        ['😀 Party', '😀P'],
        ['', '']
    ])('turns "%s" into "%s"', (name, initials) =>
    {
        expect(getInitials(name)).toBe(initials);
    });
});

describe('getErrorMessage', () =>
{
    it('reads the message from an ApiError', () =>
    {
        expect(getErrorMessage({ status: 400, message: 'Bad' }, 'Fallback')).toBe('Bad');
    });

    it.each([['a string', 'oops'], ['null', null], ['an object without a message', { status: 500 }]])('uses the fallback for %s', (_description, error) =>
    {
        expect(getErrorMessage(error, 'Fallback')).toBe('Fallback');
    });
});
