// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract GenX402Control {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_OPERATIONAL_BPS = 6_000;
    uint256 public constant MIN_REVENUE_BPS = 3_000;
    uint256 public constant MIN_GENLAYER_BPS = 1_000;
    uint256 public constant TIMELOCK_DELAY = 1 days;

    address public immutable usdc;
    address public platformReporter;
    bool public paused;

    mapping(address => bool) public admins;
    mapping(address => bool) public operators;

    struct Provider {
        bytes32 id;
        bytes32 endpointHash;
        bytes32 capabilityHash;
        uint256 priceCeiling;
        bool active;
        uint64 updatedAt;
    }

    struct ApiKey {
        bytes32 keyHash;
        bytes32 ownerHash;
        uint64 expiresAt;
        uint32 rateLimitPerMinute;
        uint256 scopes;
        bool active;
    }

    struct Job {
        bytes32 quoteId;
        bytes32 requestHash;
        bytes32 evidenceHash;
        bytes32 verdictHash;
        uint256 customerAmount;
        uint256 providerSpent;
        uint256 genlayerReserve;
        address payer;
        bool recorded;
        bool refunded;
    }

    struct TimelockAction {
        bytes32 actionType;
        bytes data;
        uint64 executeAfter;
        bool executed;
        bool canceled;
    }

    mapping(bytes32 => Provider) public providers;
    mapping(bytes32 => ApiKey) public apiKeys;
    mapping(bytes32 => Job) public jobs;
    mapping(bytes32 => TimelockAction) public timelocks;

    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);
    event OperatorSet(address indexed operator, bool active);
    event PlatformReporterChanged(address indexed previousReporter, address indexed newReporter);
    event ProtocolPaused(address indexed admin);
    event ProtocolResumed(address indexed admin);
    event ProviderSet(bytes32 indexed providerId, bytes32 endpointHash, bytes32 capabilityHash, uint256 priceCeiling, bool active);
    event ApiKeySet(bytes32 indexed keyId, bytes32 keyHash, bytes32 ownerHash, uint256 scopes, uint32 rateLimitPerMinute, uint64 expiresAt, bool active);
    event PaymentRecorded(bytes32 indexed jobId, bytes32 indexed quoteId, address indexed payer, uint256 customerAmount, uint256 genlayerReserve);
    event ProviderBudgetReleased(bytes32 indexed jobId, address indexed operationsWallet, uint256 amount, uint256 totalProviderSpent);
    event JobProofUpdated(bytes32 indexed jobId, bytes32 evidenceHash, bytes32 verdictHash);
    event JobRefunded(bytes32 indexed jobId, address indexed payer, uint256 amount);
    event TimelockQueued(bytes32 indexed actionId, bytes32 indexed actionType, uint64 executeAfter);
    event TimelockCanceled(bytes32 indexed actionId);
    event TimelockExecuted(bytes32 indexed actionId, bytes32 indexed actionType);

    modifier onlyAdmin() {
        require(admins[msg.sender], "ADMIN_ONLY");
        _;
    }

    modifier onlyPlatform() {
        require(msg.sender == platformReporter || admins[msg.sender], "PLATFORM_ONLY");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == platformReporter || admins[msg.sender] || operators[msg.sender], "OPERATOR_ONLY");
        _;
    }

    modifier whenActive() {
        require(!paused, "PROTOCOL_PAUSED");
        _;
    }

    constructor(address initialAdmin, address reporter, address usdcToken) {
        require(initialAdmin != address(0) && reporter != address(0) && usdcToken != address(0), "ZERO_ADDRESS");
        admins[initialAdmin] = true;
        platformReporter = reporter;
        usdc = usdcToken;
        emit AdminAdded(initialAdmin);
    }

    function addAdmin(address admin) external onlyAdmin {
        require(admin != address(0), "ZERO_ADDRESS");
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    function removeAdmin(address admin) external onlyAdmin {
        require(admin != msg.sender, "SELF_REMOVE_DISABLED");
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    function setOperator(address operator, bool active) external onlyAdmin {
        operators[operator] = active;
        emit OperatorSet(operator, active);
    }

    function setPlatformReporter(address reporter) external onlyAdmin {
        require(reporter != address(0), "ZERO_ADDRESS");
        address previous = platformReporter;
        platformReporter = reporter;
        emit PlatformReporterChanged(previous, reporter);
    }

    function pause() external onlyAdmin {
        paused = true;
        emit ProtocolPaused(msg.sender);
    }

    function resume() external onlyAdmin {
        paused = false;
        emit ProtocolResumed(msg.sender);
    }

    function setProvider(bytes32 providerId, bytes32 endpointHash, bytes32 capabilityHash, uint256 priceCeiling, bool active) external onlyAdmin {
        require(providerId != bytes32(0) && endpointHash != bytes32(0), "INVALID_PROVIDER");
        providers[providerId] = Provider(providerId, endpointHash, capabilityHash, priceCeiling, active, uint64(block.timestamp));
        emit ProviderSet(providerId, endpointHash, capabilityHash, priceCeiling, active);
    }

    function setApiKey(bytes32 keyId, bytes32 keyHash, bytes32 ownerHash, uint256 scopes, uint32 rateLimitPerMinute, uint64 expiresAt, bool active) external onlyPlatform {
        require(keyId != bytes32(0) && keyHash != bytes32(0), "INVALID_KEY");
        apiKeys[keyId] = ApiKey(keyHash, ownerHash, expiresAt, rateLimitPerMinute, scopes, active);
        emit ApiKeySet(keyId, keyHash, ownerHash, scopes, rateLimitPerMinute, expiresAt, active);
    }

    function revokeApiKey(bytes32 keyId) external onlyPlatform {
        apiKeys[keyId].active = false;
        emit ApiKeySet(keyId, apiKeys[keyId].keyHash, apiKeys[keyId].ownerHash, apiKeys[keyId].scopes, apiKeys[keyId].rateLimitPerMinute, apiKeys[keyId].expiresAt, false);
    }

    function recordPayment(bytes32 jobId, bytes32 quoteId, bytes32 requestHash, address payer, uint256 customerAmount) external onlyPlatform whenActive {
        require(!jobs[jobId].recorded, "JOB_ALREADY_RECORDED");
        require(customerAmount >= 1e6, "MINIMUM_ONE_USDC");
        uint256 genlayerReserve = customerAmount * MIN_GENLAYER_BPS / BPS;
        jobs[jobId] = Job(quoteId, requestHash, bytes32(0), bytes32(0), customerAmount, 0, genlayerReserve, payer, true, false);
        emit PaymentRecorded(jobId, quoteId, payer, customerAmount, genlayerReserve);
    }

    function releaseProviderBudget(bytes32 jobId, address operationsWallet, uint256 amount) external onlyOperator whenActive {
        Job storage job = jobs[jobId];
        require(job.recorded && !job.refunded, "INVALID_JOB");
        require(operationsWallet != address(0), "ZERO_ADDRESS");
        uint256 nextSpent = job.providerSpent + amount;
        require(nextSpent <= job.customerAmount * MAX_OPERATIONAL_BPS / BPS, "OPERATIONAL_LIMIT");
        job.providerSpent = nextSpent;
        require(IERC20(usdc).transfer(operationsWallet, amount), "USDC_TRANSFER_FAILED");
        emit ProviderBudgetReleased(jobId, operationsWallet, amount, nextSpent);
    }

    function updateJobProof(bytes32 jobId, bytes32 evidenceHash, bytes32 verdictHash) external onlyPlatform {
        require(jobs[jobId].recorded, "INVALID_JOB");
        jobs[jobId].evidenceHash = evidenceHash;
        jobs[jobId].verdictHash = verdictHash;
        emit JobProofUpdated(jobId, evidenceHash, verdictHash);
    }

    function refundJob(bytes32 jobId) external onlyOperator {
        Job storage job = jobs[jobId];
        require(job.recorded && !job.refunded, "INVALID_JOB");
        job.refunded = true;
        require(IERC20(usdc).balanceOf(address(this)) >= job.customerAmount, "INSUFFICIENT_REFUND_LIQUIDITY");
        require(IERC20(usdc).transfer(job.payer, job.customerAmount), "USDC_TRANSFER_FAILED");
        emit JobRefunded(jobId, job.payer, job.customerAmount);
    }

    function queueAction(bytes32 actionType, bytes calldata data, bytes32 salt) external onlyAdmin returns (bytes32 actionId) {
        actionId = keccak256(abi.encode(actionType, data, salt));
        require(timelocks[actionId].executeAfter == 0, "ACTION_EXISTS");
        uint64 executeAfter = uint64(block.timestamp + TIMELOCK_DELAY);
        timelocks[actionId] = TimelockAction(actionType, data, executeAfter, false, false);
        emit TimelockQueued(actionId, actionType, executeAfter);
    }

    function cancelAction(bytes32 actionId) external onlyAdmin {
        TimelockAction storage action = timelocks[actionId];
        require(action.executeAfter != 0 && !action.executed, "INVALID_ACTION");
        action.canceled = true;
        emit TimelockCanceled(actionId);
    }

    function executeTreasuryWithdrawal(bytes32 actionId, address to, uint256 amount) external onlyAdmin {
        TimelockAction storage action = timelocks[actionId];
        require(action.actionType == keccak256("TREASURY_WITHDRAWAL"), "WRONG_ACTION");
        require(!action.executed && !action.canceled && block.timestamp >= action.executeAfter, "TIMELOCK_NOT_READY");
        require(keccak256(action.data) == keccak256(abi.encode(to, amount)), "ACTION_MISMATCH");
        action.executed = true;
        require(IERC20(usdc).transfer(to, amount), "USDC_TRANSFER_FAILED");
        emit TimelockExecuted(actionId, action.actionType);
    }

    function availableTreasuryBalance() external view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }
}
