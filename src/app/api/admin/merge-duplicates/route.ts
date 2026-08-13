// src/app/api/admin/merge-duplicates/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { AuthorizationError, getSupabaseAdmin, requireAdministrator } from '@/lib/server/authorization';

interface DuplicateEntry {
  handler_name: string;
  dog_call_name: string;
  cwags_number: string;
  status: string;
  entry_id: string;
  submitted_at: string;
  num_selections: number;
  num_scores: number;
  action: 'KEEP' | 'MERGE (has scores!)' | 'MERGE (has selections)' | 'DELETE (empty)';
}

export async function POST(request: NextRequest) {
  try {
    await requireAdministrator();

    const { trialId, duplicates } = await request.json();

    if (!trialId || !Array.isArray(duplicates)) {
      return NextResponse.json(
        { error: 'Invalid request: trialId and duplicates array required' },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting merge for trial ${trialId}`);
    console.log(`📊 Processing ${duplicates.length} entries`);

    const result = await mergeDuplicateEntries(duplicates);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('❌ Merge operation failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function mergeDuplicateEntries(duplicates: DuplicateEntry[]) {
  // Resolve privileged credentials only when this legacy endpoint is called.
  // This keeps builds credential-free while the endpoint is removed or
  // converted to SDDA row-level-security operations.
  const supabaseAdmin = getSupabaseAdmin();
  const stats = {
    totalGroups: 0,
    mergedEntries: 0,
    deletedEntries: 0,
    movedSelections: 0,
    deletedSelections: 0,
    preservedScores: 0,
    errors: [] as string[],
  };

  // Group by handler+dog+cwags
  const groups = new Map<string, DuplicateEntry[]>();

  duplicates.forEach((entry) => {
    const key = `${entry.handler_name}|${entry.dog_call_name}|${entry.cwags_number}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(entry);
  });

  stats.totalGroups = groups.size;

  // Process each group
  for (const [key, groupEntries] of groups.entries()) {
    console.log(`\n📝 Processing: ${key}`);

    try {
      // Find primary and duplicates
      const primary = groupEntries.find((e) => e.status.startsWith('✅'));
      const dups = groupEntries.filter((e) => e.status.startsWith('❌'));

      if (!primary) {
        stats.errors.push(`No primary entry for ${key}`);
        continue;
      }

      console.log(`   Primary: ${primary.entry_id}`);
      console.log(`   Processing ${dups.length} duplicates`);

      // Process each duplicate
      for (const dup of dups) {
        if (dup.action === 'DELETE (empty)') {
          // Simple delete for empty entries
          const { error } = await supabaseAdmin.from('entries').delete().eq('id', dup.entry_id);

          if (error) {
            stats.errors.push(`Failed to delete ${dup.entry_id}: ${error.message}`);
          } else {
            stats.deletedEntries++;
            console.log(`   ✅ Deleted empty entry ${dup.entry_id}`);
          }
        } else if (dup.action.startsWith('MERGE')) {
          // Get all selections from duplicate
          const { data: selections, error: fetchError } = await supabaseAdmin
            .from('entry_selections')
            .select('id, trial_round_id, entry_type')
            .eq('entry_id', dup.entry_id);

          if (fetchError) {
            stats.errors.push(
              `Failed to fetch selections for ${dup.entry_id}: ${fetchError.message}`
            );
            continue;
          }

          if (!selections || selections.length === 0) {
            // Empty entry, just delete it
            const { error: deleteError } = await supabaseAdmin
              .from('entries')
              .delete()
              .eq('id', dup.entry_id);

            if (!deleteError) {
              stats.deletedEntries++;
              console.log(`   ✅ Deleted empty entry`);
            }
            continue;
          }

          // For each selection, check if it has scores by querying the scores table directly
          const selectionIds = selections.map((s) => s.id);
          const { data: scoresData } = await supabaseAdmin
            .from('scores')
            .select('entry_selection_id')
            .in('entry_selection_id', selectionIds);

          const selectionsWithScoresSet = new Set(
            (scoresData || []).map((s) => s.entry_selection_id)
          );

          // Get existing selections in primary
          const { data: primarySelections } = await supabaseAdmin
            .from('entry_selections')
            .select('trial_round_id, entry_type')
            .eq('entry_id', primary.entry_id);

          const primaryKeys = new Set(
            (primarySelections || []).map((s) => `${s.trial_round_id}-${s.entry_type}`)
          );

          // Separate selections into categories
          const selectionsWithScores: any[] = [];
          const selectionsWithoutScores: any[] = [];

          selections.forEach((sel) => {
            const hasScores = selectionsWithScoresSet.has(sel.id);
            if (hasScores) {
              selectionsWithScores.push(sel);
            } else {
              selectionsWithoutScores.push(sel);
            }
          });

          console.log(
            `   📊 Found ${selectionsWithScores.length} selections with scores, ${selectionsWithoutScores.length} without`
          );

          // STEP 1: Move ALL selections with scores to primary (preserve scores!)
          if (selectionsWithScores.length > 0) {
            console.log(
              `   🔄 Processing ${selectionsWithScores.length} selections with scores...`
            );

            let successfulMoves = 0;
            let totalScoresMoved = 0;

            // Process each selection individually to handle conflicts
            for (const sel of selectionsWithScores) {
              // Check if primary already has a selection for this round
              const conflictKey = `${sel.trial_round_id}-${sel.entry_type}`;

              if (primaryKeys.has(conflictKey)) {
                console.log(`   ⚠️  Conflict detected for round ${sel.trial_round_id}`);

                // Get the conflicting selection from primary
                const { data: conflictingSelections } = await supabaseAdmin
                  .from('entry_selections')
                  .select('id')
                  .eq('entry_id', primary.entry_id)
                  .eq('trial_round_id', sel.trial_round_id)
                  .eq('entry_type', sel.entry_type);

                if (conflictingSelections && conflictingSelections.length > 0) {
                  const conflictId = conflictingSelections[0].id;

                  // Check if the conflicting selection has scores
                  const { data: conflictScores } = await supabaseAdmin
                    .from('scores')
                    .select('id')
                    .eq('entry_selection_id', conflictId);

                  if (!conflictScores || conflictScores.length === 0) {
                    // Primary's selection is empty - delete it to make room
                    console.log(`   🗑️  Deleting empty conflicting selection from primary`);
                    const { error: deleteError } = await supabaseAdmin
                      .from('entry_selections')
                      .delete()
                      .eq('id', conflictId);

                    if (deleteError) {
                      console.log(
                        `   ❌ Failed to delete conflicting selection: ${deleteError.message}`
                      );
                      continue;
                    }

                    // Remove from set so we don't think it exists anymore
                    primaryKeys.delete(conflictKey);
                  } else {
                    // Both have scores - this is a real conflict, can't merge
                    console.log(`   ❌ Both selections have scores - cannot merge this round`);
                    stats.errors.push(
                      `Cannot merge ${dup.entry_id}: both entries have scores for round ${sel.trial_round_id}`
                    );
                    continue;
                  }
                }
              }

              // Now try to move the selection
              const { error: moveError } = await supabaseAdmin
                .from('entry_selections')
                .update({ entry_id: primary.entry_id })
                .eq('id', sel.id);

              if (moveError) {
                console.log(`   ❌ Failed to move selection ${sel.id}: ${moveError.message}`);
                stats.errors.push(`Failed to move selection ${sel.id}: ${moveError.message}`);
              } else {
                successfulMoves++;

                // Count scores for this selection
                const { count } = await supabaseAdmin
                  .from('scores')
                  .select('*', { count: 'exact', head: true })
                  .eq('entry_selection_id', sel.id);

                totalScoresMoved += count || 0;
              }
            }

            stats.movedSelections += successfulMoves;
            stats.preservedScores += totalScoresMoved;

            if (successfulMoves > 0) {
              console.log(
                `   ✅ Successfully moved ${successfulMoves} selections with ${totalScoresMoved} scores`
              );
            }

            // If we couldn't move any selections, don't try to delete the entry
            if (successfulMoves === 0 && selectionsWithScores.length > 0) {
              console.log(`   ⚠️  Could not move any selections, skipping entry deletion`);
              continue;
            }
          }

          // STEP 2: Handle selections without scores
          const selectionsToMove: any[] = [];
          const selectionsToDelete: any[] = [];

          selectionsWithoutScores.forEach((sel) => {
            const key = `${sel.trial_round_id}-${sel.entry_type}`;
            if (primaryKeys.has(key)) {
              // Conflict: delete this selection (it's empty and duplicate)
              selectionsToDelete.push(sel);
            } else {
              // No conflict: move to primary
              selectionsToMove.push(sel);
            }
          });

          // Move non-conflicting selections
          if (selectionsToMove.length > 0) {
            const idsToMove = selectionsToMove.map((s) => s.id);

            const { error: moveError } = await supabaseAdmin
              .from('entry_selections')
              .update({ entry_id: primary.entry_id })
              .in('id', idsToMove);

            if (moveError) {
              stats.errors.push(
                `Failed to move non-conflicting selections for ${dup.entry_id}: ${moveError.message}`
              );
            } else {
              stats.movedSelections += selectionsToMove.length;
              console.log(`   ✅ Moved ${selectionsToMove.length} non-conflicting selections`);
            }
          }

          // Delete conflicting empty selections
          if (selectionsToDelete.length > 0) {
            const idsToDelete = selectionsToDelete.map((s) => s.id);

            const { error: deleteError } = await supabaseAdmin
              .from('entry_selections')
              .delete()
              .in('id', idsToDelete);

            if (deleteError) {
              stats.errors.push(
                `Failed to delete conflicting selections for ${dup.entry_id}: ${deleteError.message}`
              );
            } else {
              stats.deletedSelections += selectionsToDelete.length;
              console.log(
                `   🗑️  Deleted ${selectionsToDelete.length} conflicting empty selections`
              );
            }
          }

          // STEP 3: Now delete the duplicate entry (should be empty or have moved selections)
          const { error: deleteEntryError } = await supabaseAdmin
            .from('entries')
            .delete()
            .eq('id', dup.entry_id);

          if (deleteEntryError) {
            stats.errors.push(
              `Failed to delete merged entry ${dup.entry_id}: ${deleteEntryError.message}`
            );
            console.log(`   ❌ Failed to delete entry: ${deleteEntryError.message}`);
          } else {
            stats.deletedEntries++;
            stats.mergedEntries++;
            console.log(`   ✅ Deleted duplicate entry`);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      stats.errors.push(`Error processing ${key}: ${errorMsg}`);
      console.error(`   ❌ Error: ${errorMsg}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 MERGE COMPLETE');
  console.log('='.repeat(60));
  console.log(`Groups processed: ${stats.totalGroups}`);
  console.log(`Entries merged: ${stats.mergedEntries}`);
  console.log(`Entries deleted: ${stats.deletedEntries}`);
  console.log(`Selections moved: ${stats.movedSelections}`);
  console.log(`Selections deleted: ${stats.deletedSelections}`);
  console.log(`Scores preserved: ${stats.preservedScores}`);
  console.log(`Errors: ${stats.errors.length}`);

  return {
    success: stats.errors.length === 0,
    ...stats,
  };
}
