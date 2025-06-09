/**
 * Configuration for the Chris vs Layla guessing game
 * 
 * This game allows users to guess whether a random message was written by
 * Chris or Layla. The game reads their messages from text files and presents
 * them to players for guessing.
 */
export const GuessGameConfig = {
    /**
     * File paths for the message collections
     */
    CHRIS_FILE_PATH: "/Users/monke/Desktop/ELOBot/src/util/UserEmulator/snow.txt",
    LAYLA_FILE_PATH: "/Users/monke/Desktop/ELOBot/src/util/UserEmulator/moni.txt",
    
    /**
     * Display names for the users
     */
    USER_NAMES: {
        "chris": "Snow",
        "layla": "Moni"
    },
    
    /**
     * Minimum word count to consider a message for the game
     * This helps filter out very short messages that might be too easy
     */
    MIN_WORD_COUNT: 7,
    
    /**
     * Time in milliseconds that a user has to make a guess
     */
    GUESS_TIMEOUT: 30000,  // 30 seconds
    
    /**
     * Maximum message length to display
     * For very long messages, we'll truncate them to prevent the embed from being too large
     */
    MAX_MESSAGE_LENGTH: 1500
};
