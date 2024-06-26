/**
 * Class representing a response payload.
 */
export class ResponsePayload {
    /**
     * The status of the response.
     * @public
     */
    public status: any;

    /**
     * The data of the response.
     * @public
     */
    public data: any;

    /**
     * Creates an instance of ResponsePayload.
     * @param {any} status - The status of the response.
     * @param {any} data - The data of the response.
     */
    constructor(status: any, data: any) {
        this.status = status;
        this.data = data;
    }
}
