import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ExternalEventProvider } from '@prisma/client';
import { IGuestProvider } from '../pl-event-guest-sync.interface';
import { LumaGuestProvider } from '../../../utils/luma/luma-guest.provider';

/**
 * Factory for creating guest provider instances
 * Supports multiple provider types with easy extensibility
 * 
 * To add a new provider:
 * 1. Add the provider type to ExternalEventProvider enum in schema.prisma
 * 2. Create a new provider class implementing IGuestProvider
 * 3. Add the case to the switch statement below
 * 4. Register the provider in PLEventGuestSyncModule
 */
@Injectable()
export class GuestProviderFactory {
  private readonly logger = new Logger(GuestProviderFactory.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Gets a provider instance for the given type
   * @param providerType - The type of provider to retrieve
   * @returns The provider instance
   * @throws Error if provider type is unknown or not configured
   */
  getProvider(providerType: ExternalEventProvider): IGuestProvider {
    let provider: IGuestProvider;

    switch (providerType) {
      case ExternalEventProvider.LUMA:
        provider = this.moduleRef.get(LumaGuestProvider, { strict: false });
        break;
      // Add new providers here:
      default:
        throw new Error(`Unknown guest provider type: ${providerType}`);
    }

    if (!provider.isConfigured()) {
      throw new Error(`Provider ${providerType} is not properly configured`);
    }

    return provider;
  }

  /**
   * Gets a list of all configured provider types
   * @returns Array of configured provider types
   */
  getConfiguredProviders(): ExternalEventProvider[] {
    const configured: ExternalEventProvider[] = [];

    for (const type of Object.values(ExternalEventProvider)) {
      try {
        const provider = this.getProvider(type);
        if (provider.isConfigured()) {
          configured.push(type);
        }
      } catch {
        // Provider not configured, skip
      }
    }

    return configured;
  }
}

