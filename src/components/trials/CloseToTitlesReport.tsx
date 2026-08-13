// src/components/trials/CloseToTitlesReport.tsx
// ============================================================
// "Close to Titles" Report Display Component
//
// Shows which dogs are close to earning titles or aces,
// assuming 100% pass rate for all their entries.
// ============================================================

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Trophy,
  Medal,
  Download,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { localDateOnly } from '@/lib/dateOnly';
import * as XLSX from 'xlsx';
import {
  generateCloseToTitlesReport,
  CloseToTitlesReport as ReportData,
  DogCloseToTitle,
  formatTitleName,
} from '@/lib/closeToTitlesAnalyzer';
import { getClassOrder } from '@/lib/cwagsClassNames';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

interface CloseToTitlesReportProps {
  trialId: string;
  trialName?: string;
}

export default function CloseToTitlesReport({ trialId, trialName }: CloseToTitlesReportProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['titles', 'aces'])
  );
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadReport();
  }, [trialId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Your session has expired');
      const response = await fetch(`/api/trials/${trialId}/close-to-titles`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const source = await response.json();
      if (!response.ok) throw new Error(source.error || 'Failed to load report data');
      const data = await generateCloseToTitlesReport(trialId, source);
      setReport(data);
    } catch (err) {
      console.error('Error loading close to titles report:', err);
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const groupByClass = (dogs: DogCloseToTitle[]) => {
    const grouped = new Map<string, DogCloseToTitle[]>();
    dogs.forEach((dog) => {
      if (!grouped.has(dog.className)) {
        grouped.set(dog.className, []);
      }
      grouped.get(dog.className)!.push(dog);
    });

    // Sort classes by C-WAGS order
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
      return getClassOrder(a[0]) - getClassOrder(b[0]);
    });

    return new Map(sortedEntries);
  };

  // Calculate summary totals
  const calculateSummaryTotals = () => {
    if (!report) return null;

    // Count aces by number
    const acesByNumber = new Map<number, number>();
    report.closeToAces.forEach((dog) => {
      const count = acesByNumber.get(dog.aceNumber) || 0;
      acesByNumber.set(dog.aceNumber, count + 1);
    });

    return {
      totalTitles: report.closeToTitles.length,
      acesByNumber,
      totalAchievements: report.closeToTitles.length + report.closeToAces.length,
    };
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!report) return;

    try {
      setExporting(true);
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryData = [
        ['Close to Titles Report'],
        ['Trial:', report.trialName],
        ['Generated:', new Date(report.generatedAt).toLocaleString()],
        [],
        ['Summary Statistics:'],
        ['Dogs Close to Titles:', String(report.closeToTitles.length)],
        ['Dogs Close to Aces:', String(report.closeToAces.length)],
        [],
        ['Note: Assumes 100% pass rate for all entered runs'],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Close to Titles (Grouped by Class)
      if (report.closeToTitles.length > 0) {
        const titlesData = [['Dogs Close to Titles'], []];

        // Group by class using the same function as display
        const titlesByClass = groupByClass(report.closeToTitles);

        // Add each class group
        titlesByClass.forEach((dogs, className) => {
          // Class header
          titlesData.push([]);
          titlesData.push([`${className} — ${formatTitleName(className)}`]);
          titlesData.push([
            'Dog Name',
            'Handler',
            'C-WAGS #',
            'Current Qs',
            'Projected Qs',
            'Entries',
            'Qs Needed',
            'Judges Needed',
            'Games Needed',
          ]);

          // Add dogs in this class
          dogs.forEach((dog) => {
            titlesData.push([
              dog.dogName,
              dog.handlerName,
              dog.cwagsNumber,
              String(dog.currentQs),
              String(dog.projectedQs),
              String(dog.entriesInThisTrial),
              String(dog.qsNeededForTitle),
              String(dog.judgesNeededForTitle),
              String(dog.gamesNeededForTitle || 0),
            ]);
          });
        });

        const wsTitles = XLSX.utils.aoa_to_sheet(titlesData);
        wsTitles['!cols'] = [
          { wch: 20 },
          { wch: 25 },
          { wch: 15 },
          { wch: 12 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, wsTitles, 'Close to Titles');
      }

      // Sheet 3: Close to Aces (Grouped by Class)
      if (report.closeToAces.length > 0) {
        const acesData = [['Dogs Close to Aces'], []];

        // Group by class using the same function as display
        const acesByClass = groupByClass(report.closeToAces);

        // Add each class group
        acesByClass.forEach((dogs, className) => {
          // Class header
          acesData.push([]);
          acesData.push([`${className} — ${formatTitleName(className)}`]);
          acesData.push([
            'Dog Name',
            'Handler',
            'C-WAGS #',
            'Current Ace Qs',
            'Projected Ace Qs',
            'Entries',
            'Ace Number',
            'Qs Needed',
          ]);

          // Add dogs in this class
          dogs.forEach((dog) => {
            acesData.push([
              dog.dogName,
              dog.handlerName,
              dog.cwagsNumber,
              String(dog.aceQs),
              String(dog.aceQs + dog.entriesInThisTrial),
              String(dog.entriesInThisTrial),
              String(dog.aceNumber),
              String(dog.qsNeededForNextAce),
            ]);
          });
        });

        const wsAces = XLSX.utils.aoa_to_sheet(acesData);
        wsAces['!cols'] = [
          { wch: 20 },
          { wch: 25 },
          { wch: 15 },
          { wch: 15 },
          { wch: 15 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, wsAces, 'Close to Aces');
      }

      // Sheet 4: Summary Totals
      const summaryTotals = calculateSummaryTotals();
      if (summaryTotals) {
        const totalsData = [
          ['SUMMARY OF ACHIEVEMENTS'],
          ['Projected achievements if all dogs qualify in all entered runs'],
          [],
          ['TITLES TO BE EARNED:'],
          ['Total New Titles', String(summaryTotals.totalTitles)],
          [],
          ['ACES TO BE EARNED (by number):'],
        ];

        // Add ace counts
        const maxAce = Math.max(...Array.from(summaryTotals.acesByNumber.keys()));
        for (let i = 1; i <= maxAce; i++) {
          const count = summaryTotals.acesByNumber.get(i) || 0;
          if (count > 0) {
            totalsData.push([`Ace #${i}`, String(count)]);
          }
        }

        totalsData.push([]);
        totalsData.push(['GRAND TOTAL ACHIEVEMENTS:', String(summaryTotals.totalAchievements)]);

        const wsTotals = XLSX.utils.aoa_to_sheet(totalsData);
        wsTotals['!cols'] = [{ wch: 30 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsTotals, 'Summary Totals');
      }

      // Generate filename with date
      const dateStr = localDateOnly();
      const filename = `Close-to-Titles-${report.trialName.replace(/[^a-z0-9]/gi, '-')}-${dateStr}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Failed to export Excel file');
    } finally {
      setExporting(false);
    }
  };

  // Export to PDF (using browser print)
  const exportToPDF = () => {
    // Expand all sections before printing
    setExpandedSections(new Set(['titles', 'aces']));

    // Wait for sections to expand, then print
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Analyzing entries and tracker history...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!report) return null;

  const titlesByClass = groupByClass(report.closeToTitles);
  const acesByClass = groupByClass(report.closeToAces);

  const hasResults = report.closeToTitles.length > 0 || report.closeToAces.length > 0;

  return (
    <div className="space-y-6 print-report-only">
      {/* Header Card */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-purple-700 to-purple-900 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8" />
              <div>
                <h2 className="text-2xl font-bold">Close to Titles Report</h2>
                <p className="text-purple-200 text-sm mt-1">{trialName || report.trialName}</p>
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <Button
                onClick={exportToExcel}
                disabled={exporting}
                variant="outline"
                className="bg-white text-green-700 hover:bg-green-50 border-green-600"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
              <Button
                onClick={exportToPDF}
                variant="outline"
                className="bg-white text-purple-700 hover:bg-purple-50"
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <Alert className="bg-blue-50 border-blue-200">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <strong>Assumption:</strong> This report assumes a 100% pass rate for all entered
              runs. Results shown are what each dog <em>could</em> earn if they qualify in every
              round they're entered.
            </AlertDescription>
          </Alert>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Close to Titles</p>
                  <p className="text-3xl font-bold text-purple-700">
                    {report.closeToTitles.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-200">
              <div className="flex items-center gap-3">
                <Medal className="h-6 w-6 text-yellow-600" />
                <div>
                  <p className="text-sm text-gray-600">Close to Aces</p>
                  <p className="text-3xl font-bold text-yellow-700">{report.closeToAces.length}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No Results Message */}
      {!hasResults && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No dogs are close to earning titles or aces in this trial.</p>
            <p className="text-sm mt-2">(Based on current entries and assuming 100% pass rate)</p>
          </CardContent>
        </Card>
      )}

      {/* Dogs Close to Titles */}
      {report.closeToTitles.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSection('titles')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-6 w-6 text-purple-600" />
                <div>
                  <h3 className="text-xl font-bold">Dogs Close to Titles</h3>
                  <p className="text-sm text-gray-600">
                    {report.closeToTitles.length} dog{report.closeToTitles.length !== 1 ? 's' : ''}{' '}
                    will earn title(s) if they Q all runs
                  </p>
                </div>
              </div>
              {expandedSections.has('titles') ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </CardHeader>

          {expandedSections.has('titles') && (
            <CardContent className="p-6 space-y-6">
              {Array.from(titlesByClass.entries()).map(([className, dogs]) => (
                <div key={className} className="border-l-4 border-purple-400 pl-4">
                  <h4 className="font-bold text-lg text-purple-700 mb-3">
                    {className} — {formatTitleName(className)}
                  </h4>

                  <div className="space-y-3">
                    {dogs.map((dog, idx) => (
                      <div
                        key={idx}
                        className="bg-purple-50 rounded-lg p-4 border border-purple-200 break-inside-avoid"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-bold text-lg">{dog.dogName}</p>
                            <p className="text-sm text-gray-600">{dog.handlerName}</p>
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              {dog.cwagsNumber}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="bg-purple-700 text-white px-3 py-1 rounded-full text-sm font-semibold">
                              🎯 {dog.entriesInThisTrial}{' '}
                              {dog.entriesInThisTrial === 1 ? 'run' : 'runs'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Current Q's</p>
                            <p className="font-bold">{dog.currentQs}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Projected Q's</p>
                            <p className="font-bold text-purple-600">{dog.projectedQs}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Needed</p>
                            <p className="font-bold text-green-600">
                              {dog.qsNeededForTitle} Q{dog.qsNeededForTitle !== 1 ? "'s" : ''}
                              {dog.judgesNeededForTitle > 0 && `, ${dog.judgesNeededForTitle} J`}
                              {dog.gamesNeededForTitle > 0 && `, ${dog.gamesNeededForTitle} G`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Dogs Close to Aces */}
      {report.closeToAces.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSection('aces')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Medal className="h-6 w-6 text-yellow-600" />
                <div>
                  <h3 className="text-xl font-bold">Dogs Close to Aces</h3>
                  <p className="text-sm text-gray-600">
                    {report.closeToAces.length} dog{report.closeToAces.length !== 1 ? 's' : ''} will
                    earn ace(s) if they Q all runs
                  </p>
                </div>
              </div>
              {expandedSections.has('aces') ? (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </CardHeader>

          {expandedSections.has('aces') && (
            <CardContent className="p-6 space-y-6">
              {Array.from(acesByClass.entries()).map(([className, dogs]) => (
                <div key={className} className="border-l-4 border-yellow-400 pl-4">
                  <h4 className="font-bold text-lg text-yellow-700 mb-3">
                    {className} — {formatTitleName(className)}
                  </h4>

                  <div className="space-y-3">
                    {dogs.map((dog, idx) => (
                      <div
                        key={idx}
                        className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 break-inside-avoid"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-bold text-lg">{dog.dogName}</p>
                            <p className="text-sm text-gray-600">{dog.handlerName}</p>
                            <p className="text-xs text-gray-500 font-mono mt-1">
                              {dog.cwagsNumber}
                            </p>
                          </div>

                          <div className="text-right">
                            <div className="bg-yellow-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                              🏆 Ace #{dog.aceNumber}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Current Ace Q's</p>
                            <p className="font-bold">{dog.aceQs}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Projected</p>
                            <p className="font-bold text-yellow-600">
                              {dog.aceQs + dog.entriesInThisTrial}
                            </p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-gray-500 text-xs">Needed for Ace</p>
                            <p className="font-bold text-green-600">
                              {dog.qsNeededForNextAce} Q{dog.qsNeededForNextAce !== 1 ? "'s" : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Summary Totals */}
      {hasResults &&
        (() => {
          const totals = calculateSummaryTotals();
          if (!totals) return null;

          return (
            <Card className="break-inside-avoid">
              <CardHeader className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6" />
                  <div>
                    <h3 className="text-xl font-bold">Summary of Achievements</h3>
                    <p className="text-emerald-100 text-sm mt-1">
                      Total achievements projected with 100% pass rate
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Titles Column */}
                  <div className="space-y-4">
                    <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 font-semibold">New Titles</p>
                          <p className="text-4xl font-bold text-purple-700 mt-1">
                            {totals.totalTitles}
                          </p>
                        </div>
                        <Trophy className="h-12 w-12 text-purple-400" />
                      </div>
                    </div>

                    {/* Aces Breakdown */}
                    <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                      <p className="text-sm text-gray-600 font-semibold mb-3">Aces by Number</p>
                      <div className="space-y-2">
                        {Array.from(totals.acesByNumber.entries())
                          .sort((a, b) => a[0] - b[0])
                          .map(([aceNum, count]) => (
                            <div key={aceNum} className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">
                                Ace #{aceNum}
                              </span>
                              <span className="text-lg font-bold text-yellow-700 bg-yellow-100 px-3 py-1 rounded">
                                {count}
                              </span>
                            </div>
                          ))}
                        {totals.acesByNumber.size === 0 && (
                          <p className="text-sm text-gray-500 italic">None</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Grand Total Column */}
                  <div className="space-y-4">
                    {/* Grand Total */}
                    <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white rounded-lg p-6 border-2 border-emerald-700">
                      <p className="text-sm font-semibold mb-2 opacity-90">GRAND TOTAL</p>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-semibold">All Achievements</span>
                        <span className="text-5xl font-bold">{totals.totalAchievements}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

      {/* Refresh Button */}
      <div className="text-center">
        <Button onClick={loadReport} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Report
        </Button>
      </div>

      {/* Print Styles for PDF Export */}
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }

          /* CRITICAL: Hide EVERYTHING by default on print */
          body * {
            visibility: hidden !important;
          }

          /* ONLY show the report and its children */
          .print-report-only,
          .print-report-only * {
            visibility: visible !important;
          }

          /* Position the print-only version at top of page */
          .print-report-only {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }

          /* Make everything visible - remove scroll containers */
          html,
          body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          /* Remove modal/overlay restrictions */
          .fixed,
          .absolute {
            position: relative !important;
          }

          /* Make all containers expand to full height */
          div {
            max-height: none !important;
            overflow: visible !important;
          }

          /* Expand all collapsed sections */
          .space-y-6 > * {
            display: block !important;
          }

          /* Hide buttons and interactive elements within the report */
          .print-report-only button,
          .print-report-only .no-print {
            display: none !important;
            visibility: hidden !important;
          }

          /* Force expand all collapsible sections */
          [class*='CardContent'] {
            display: block !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Ensure sections don't break across pages */
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Better card styling for print */
          .bg-purple-50,
          .bg-yellow-50,
          .bg-amber-50,
          .from-amber-50,
          .to-orange-50 {
            background-color: #f9f9f9 !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Ensure borders print */
          .border,
          .border-2,
          .border-4 {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Ensure gradient backgrounds show */
          .bg-gradient-to-r,
          .bg-gradient-to-br {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Make the report container full width */
          .max-w-7xl {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
