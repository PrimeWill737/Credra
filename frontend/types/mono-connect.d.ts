declare module "@mono.co/connect.js" {
  export type MonoConnectConfig = {
    key: string;
    onSuccess?: (payload: { code?: string } & Record<string, unknown>) => void | Promise<void>;
    onClose?: () => void;
    [key: string]: unknown;
  };

  export default class Connect {
    constructor(config: MonoConnectConfig);
    setup(options?: Record<string, unknown>): void;
    open(): void;
    close(): void;
    reauthorise(reauthToken: string): void;
    fetchInstitutions(): Promise<unknown>;
  }
}

