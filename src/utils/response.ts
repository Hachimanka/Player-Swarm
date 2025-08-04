import { Response } from 'express';
import { ApiResponse, PaginatedResponse } from '../types/common';

export const sendSuccess = <T>(res: Response, data: T, message = 'Success', statusCode = 200): void => {
    const response: ApiResponse<T> = {
        success: true,
        message,
        data,
    };
    res.status(statusCode).json(response);
};

export const sendError = (res: Response, message = 'Internal Server Error', statusCode = 500, error?: string): void => {
    const response: ApiResponse = {
        success: false,
        message,
        ...(error && { error }),
    };
    res.status(statusCode).json(response);
};

export const sendPaginatedResponse = <T>(
    res: Response,
    data: T[],
    page: number,
    limit: number,
    total: number,
    message = 'Success',
): void => {
    const response: PaginatedResponse<T> = {
        success: true,
        message,
        data,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
    res.status(200).json(response);
};
