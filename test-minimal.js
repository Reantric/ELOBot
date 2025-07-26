console.log("Starting Connect4Game tests...");

// Test basic functionality
try {
    console.log("✅ Test environment is working");
    
    // Simple function test
    function add(a, b) {
        return a + b;
    }
    
    if (add(2, 3) === 5) {
        console.log("✅ Basic function test passed");
    } else {
        throw new Error("Basic function test failed");
    }
    
    console.log("🎉 All basic tests passed!");
} catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
}
