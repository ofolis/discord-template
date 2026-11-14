import { ApplicationLifecycle } from "./application-lifecycle";
import { reportStartupFailure } from "./core";

const applicationLifecycle: ApplicationLifecycle = new ApplicationLifecycle();
applicationLifecycle.installSignalHandlers();

void applicationLifecycle.start().catch((reason: unknown) => {
  reportStartupFailure(reason);
  process.exitCode = 1;
});
