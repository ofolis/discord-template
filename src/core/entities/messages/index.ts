// Export Message first (base)
export { Message } from "./message";
// Export ChannelMessage and DirectMessage second (extends Message)
export { ChannelMessage } from "./channel-message";
export { DirectMessage } from "./direct-message";
// Export ChannelCommandMessage and DirectCommandMessage third (extends the previous two)
export { ChannelCommandMessage } from "./channel-command-message";
export { DirectCommandMessage } from "./direct-command-message";
