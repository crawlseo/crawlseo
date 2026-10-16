import pkg from "../package.json";

/** The app version from package.json, inlined at build time. Nothing is fetched. */
export const APP_VERSION: string = pkg.version;
