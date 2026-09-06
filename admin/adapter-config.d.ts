// This file extends the AdapterConfig type from "@iobroker/types" (aliased as
// "@types/iobroker") with this adapter's actual native config shape (see io-package.json
// "native"), so `this.config.*` is properly typed for `npm run check` and editor support.
export {};

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            school: string;
            klasse: string;
            vpUsername: string;
            vpPassword: string;
            haUsername: string;
            haPassword: string;
            moodleCalendarUrl: string;
            pollHomeworkEtc: boolean;
            pollIntervalMinutes: number;
        }
    }
}
