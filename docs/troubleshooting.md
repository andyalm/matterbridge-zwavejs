# Troubleshooting

## Cannot connect to Z-Wave JS Server

- Verify the server is running and accessible at the configured `serverUrl`
- The default WebSocket port is **3000**. Port 8091 is the Z-Wave JS UI web interface — the plugin does not use it
- If the server is on a different host, check firewall rules and ensure the WebSocket port is open
- The plugin auto-reconnects with exponential backoff (up to 60 seconds between attempts), so transient disconnects are handled automatically

## Device not appearing in Matter

- **Interview not complete**: Nodes must have completed their Z-Wave interview to be bridged. Check the node status in Z-Wave JS UI — it should show as "ready"
- **Controller node**: The Z-Wave controller (typically node 1) is always skipped
- **Filtering**: If you're using `includeNodes`, verify the node ID is in the list. If you're using `excludeNodes`, verify it's not in the list
- **Unsupported command class**: Only the command classes listed in the [Supported Device Types](../README.md#supported-device-types) table are mapped. Devices with only unsupported command classes will be silently skipped
- **Inspect your devices**: Use the [list-zwave-devices script](../README.md#inspecting-your-z-wave-devices) to see what the server reports for each node

## Device appears as wrong type

Binary switches (on/off) are classified as a light, outlet, or switch using a multi-step heuristic:

1. **Z-Wave device class**: The `deviceClass.specific.label` is checked for keywords like "light", "power strip", etc.
2. **Device config metadata**: The `deviceConfig.label` and `deviceConfig.description` fields are searched for keywords like "plug", "outlet", "lamp", "dimmer", etc.
3. **Default**: If no heuristic matches, the device is classified as a generic switch

If a device is misclassified, check what your Z-Wave JS Server reports for its `deviceClass` and `deviceConfig` fields using the list-zwave-devices script.

## State not updating

- Toggle the device in Z-Wave JS UI and check whether the change appears in your Matter controller. This confirms whether the Z-Wave-to-Matter direction is working
- Try controlling the device from your Matter controller and check Z-Wave JS UI for the command. This confirms the Matter-to-Z-Wave direction
- Check the Matterbridge logs for errors or warnings related to value updates
