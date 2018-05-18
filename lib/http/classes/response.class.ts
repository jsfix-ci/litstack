/**
 * response.class
 * 
 * The HTTP response class is a wrapper for the
 * http response object
 */
import express = require('express');
import defaultResponse = require('default-response');

import { Response } from '../models/response.model';
import { Injector } from '../../compiler/classes/injector.class';

// @TODO MOVE THESE TO THEIR OWN FILE!!!!
export interface metaConfig {
    produces?: string;
}

export type Body = Object | any[] | null;

export class HttpResponse {

    constructor(public response: express.Response,
                private meta: metaConfig) { 
    }

    setProduces(): void {
        if(this.meta.produces) {
            this.setHeaders('Content-Type', this.meta.produces)
        }
    }

    setHeaders(key: string, val: string): void {
        this.response.set(key, val);
    }

    /**
     * @function success
     * @param {Body} body
     * 
     * Usage:
     * res.success({ id: 'some-id' })
     * 
     * Would respond with 200 OK
     * { id: 'some-id' }
     */ 
    success(body: Body, status: number = 200): void {

        this.respond(status, body);
    }

    /**
     * @function created
     * @param {Body} body
     * 
     * Usage:
     * res.created({ id: 'some-id' })
     * 
     * Would respond with 201 Created
     * { id: 'some-id' }
     */ 
    created(body: Body): void {
        this.success(body, 201);
    }

    /**
     * @function errored
     * @param {number} status
     * @param {Object | any[]} body
     * 
     * Usage:
     * res.errored(404, { message: 'The resource was not found on this server' })
     * 
     * Would respond with 404 Created
     * { message: 'The resource was not found on this server' }
     */ 
    errored(status: number = 500, body: Body = null): void {

        this.respond(status, body);
    }

    private respond(status: number, body: Object | any[] | null): void {

        // set the produces header if one exists 
        this.setProduces();

        this.response.status(status).json(body || defaultResponse.status(status));
    }
}