// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract GenX402ApiKeyRegistry {
    address public admin;
    address public platformWriter;

    struct Binding {
        address owner;
        address agent;
        bytes32 policyId;
        address delegatedAccount;
        uint64 chainId;
        uint32 version;
        uint32 rateLimitPerMinute;
        uint256 scopes;
        bool active;
    }

    mapping(bytes32 => Binding) public bindings;
    mapping(bytes32 => mapping(uint64 => uint32)) public rateUsage;

    event PlatformWriterChanged(address indexed previousWriter, address indexed newWriter);
    event BindingSet(bytes32 indexed bindingId, address indexed owner, address indexed agent, bytes32 policyId, uint32 version, bool active);
    event BindingRotated(bytes32 indexed bindingId, uint32 previousVersion, uint32 newVersion);
    event BindingRevoked(bytes32 indexed bindingId, uint32 version);
    event RateLimitConsumed(bytes32 indexed bindingId, uint64 indexed window, bytes32 indexed bucket, uint32 usage);

    modifier onlyAdmin() {
        require(msg.sender == admin, "ADMIN_ONLY");
        _;
    }

    modifier onlyWriter() {
        require(msg.sender == platformWriter || msg.sender == admin, "WRITER_ONLY");
        _;
    }

    constructor(address initialAdmin, address initialWriter) {
        require(initialAdmin != address(0) && initialWriter != address(0), "ZERO_ADDRESS");
        admin = initialAdmin;
        platformWriter = initialWriter;
    }

    function computeBindingId(address owner, address agent, bytes32 policyId, address delegatedAccount, uint64 chainId) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, agent, policyId, delegatedAccount, chainId));
    }

    function setPlatformWriter(address nextWriter) external onlyAdmin {
        require(nextWriter != address(0), "ZERO_ADDRESS");
        emit PlatformWriterChanged(platformWriter, nextWriter);
        platformWriter = nextWriter;
    }

    function setBinding(address owner, address agent, bytes32 policyId, address delegatedAccount, uint64 chainId, uint256 scopes, uint32 rateLimitPerMinute) external onlyWriter returns (bytes32 bindingId) {
        require(owner != address(0) && agent != address(0), "ZERO_ADDRESS");
        require(scopes != 0 && rateLimitPerMinute != 0, "INVALID_POLICY");
        bindingId = computeBindingId(owner, agent, policyId, delegatedAccount, chainId);
        Binding storage current = bindings[bindingId];
        require(current.owner == address(0), "BINDING_EXISTS");
        bindings[bindingId] = Binding(owner, agent, policyId, delegatedAccount, chainId, 1, rateLimitPerMinute, scopes, true);
        emit BindingSet(bindingId, owner, agent, policyId, 1, true);
    }

    function rotateBinding(bytes32 bindingId) external onlyWriter returns (uint32 nextVersion) {
        Binding storage binding = bindings[bindingId];
        require(binding.owner != address(0), "BINDING_NOT_FOUND");
        uint32 previousVersion = binding.version;
        nextVersion = previousVersion + 1;
        binding.version = nextVersion;
        binding.active = true;
        emit BindingRotated(bindingId, previousVersion, nextVersion);
    }

    function revokeBinding(bytes32 bindingId) external onlyWriter {
        Binding storage binding = bindings[bindingId];
        require(binding.owner != address(0), "BINDING_NOT_FOUND");
        binding.active = false;
        emit BindingRevoked(bindingId, binding.version);
    }

    function consumeRateLimits(bytes32 bindingId, bytes32[4] calldata buckets, uint64 window) external onlyWriter {
        Binding storage binding = bindings[bindingId];
        require(binding.owner != address(0) && binding.active, "BINDING_INACTIVE");
        uint32 limit = binding.rateLimitPerMinute;
        for (uint256 index = 0; index < buckets.length; index++) {
            uint32 usage = rateUsage[buckets[index]][window] + 1;
            require(usage <= limit, "RATE_LIMIT_EXCEEDED");
            rateUsage[buckets[index]][window] = usage;
            emit RateLimitConsumed(bindingId, window, buckets[index], usage);
        }
    }
}
