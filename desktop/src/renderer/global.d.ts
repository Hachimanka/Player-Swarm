import type { PlayerSwarmAPI } from '@shared/types';

declare global {
    interface Window {
        playerSwarm: PlayerSwarmAPI;
    }
}

export {};
