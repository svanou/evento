import { type Candidate, type Source, type Weekend, type Zone } from "./domain";
/** Sources and geography only: this provider never receives subscriber data. */
export interface DiscoveryProvider {
  discover(
    zone: Zone,
    weekend: Weekend,
    sources: Source[],
    signal: AbortSignal,
  ): Promise<Candidate[]>;
}
