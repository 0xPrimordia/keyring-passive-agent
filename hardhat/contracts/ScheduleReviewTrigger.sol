// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ScheduleReviewTrigger
/// @notice Schedules a one-time event emission to trigger the passive agent to review a specific schedule.
/// @dev Uses Hedera Schedule Service (HSS) at 0x16b. User pays 1 HBAR for gas to run the scheduled call.
interface IHederaScheduleService {
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);
}

contract ScheduleReviewTrigger {
    /// @notice Emitted when the scheduled execution runs. Listener subscribes to this event
    ///         and posts the scheduleId to each agent inbound topic.
    event ReviewTriggered(
        string scheduleId,
        string topicId1,
        string topicId2
    );

    /// @notice Only this address (validator agent) may call scheduleReviewTrigger.
    address public immutable validator;

    /// 1 HBAR = 10^8 tinybars (Hedera EVM uses 8 decimals for msg.value)
    uint256 public constant FEE_HBAR_WEI = 100_000_000;

    /// Max schedule window: 62 days
    uint256 public constant MAX_DURATION_SECONDS = 5_356_800;

    /// Gas limit for the scheduled emit call
    uint256 internal constant SCHEDULED_CALL_GAS_LIMIT = 200_000;

    IHederaScheduleService internal constant HSS =
        IHederaScheduleService(address(0x16b));

    /// @param _validator EVM address of the validator agent (VALIDATOR_ACCOUNT_ID).
    ///        For Hedera account 0.0.X, use 0x0000...0000 + accountNum as hex.
    /// @notice Allow initial HBAR funding at deploy time (e.g. for scheduled execution gas).
    constructor(address _validator) payable {
        require(_validator != address(0), "validator required");
        validator = _validator;
    }

    /// @notice Schedule a one-time trigger to emit ReviewTriggered(scheduleId, topicId1, topicId2) after durationSeconds.
    /// @param scheduleId The Hedera schedule ID (e.g. "0.0.1234") for the passive agent to review.
    /// @param durationSeconds Delay before the scheduled call executes (max 62 days).
    /// @param topicId1 First agent inbound topic ID to post scheduleId to.
    /// @param topicId2 Second agent inbound topic ID to post scheduleId to.
    /// @dev Caller must send 1 HBAR; used to pay gas when the schedule runs.
    function scheduleReviewTrigger(
        string calldata scheduleId,
        uint256 durationSeconds,
        string calldata topicId1,
        string calldata topicId2
    ) external payable {
        require(msg.sender == validator, "Only validator");
        require(msg.value >= FEE_HBAR_WEI, "Fee: 1 HBAR required");
        require(bytes(scheduleId).length > 0, "scheduleId required");
        require(bytes(topicId1).length > 0, "topicId1 required");
        require(bytes(topicId2).length > 0, "topicId2 required");
        require(durationSeconds > 0, "duration must be > 0");
        require(
            durationSeconds <= MAX_DURATION_SECONDS,
            "duration max 62 days"
        );

        uint256 expirySecond = block.timestamp + durationSeconds;

        bytes memory callData = abi.encodeWithSelector(
            this.emitReviewTrigger.selector,
            scheduleId,
            topicId1,
            topicId2
        );

        (int64 rc, ) = HSS.scheduleCall(
            address(this),
            expirySecond,
            SCHEDULED_CALL_GAS_LIMIT,
            0,
            callData
        );

        require(rc == 22, "Schedule failed"); // 22 = SUCCESS in HederaResponseCodes
    }

    /// @notice Called by the network when the scheduled time arrives. Emits the event for the listener.
    function emitReviewTrigger(
        string calldata scheduleId,
        string calldata topicId1,
        string calldata topicId2
    ) external {
        emit ReviewTriggered(scheduleId, topicId1, topicId2);
    }

    /// @notice Allow contract to receive HBAR for scheduled execution gas.
    receive() external payable {}
}
