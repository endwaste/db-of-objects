"use client";


import React, { useState } from 'react';
import EditModal from './components/EditModal';
import Header from './components/Header';
import ResultsDisplay from './components/ResultsDisplay';
import SearchForm from './components/SearchForm';
import UploadModal from './components/UploadModal';
import FilterPanel from './components/FilterPanel';

import { track } from '@vercel/analytics';
import axios from 'axios';
import Head from 'next/head';
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from 'react';
import videojs from 'video.js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';
import Layout from './layout';
import './styles.css';

import { handleFileUpload } from './components/FileUploadHandler';
import Footer from './components/Footer';

const API_URL = (() => {
  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case "development":
      return process.env.NEXT_PUBLIC_DEVELOPMENT_URL || 'http://localhost:8000';
    case "production":
      return process.env.NEXT_PUBLIC_PRODUCTION_URL || 'http://ec2-44-243-22-197.us-west-2.compute.amazonaws.com:8000';
    default:
      return "http://localhost:8000";
  }
})();

interface Result {
  score: number;
  metadata: {
    class?: string;
    date_added?: string;
    s3_file_name?: string;
    s3_file_path?: string;
    s3_presigned_url: string;
    whole_image_presigned_url?: string;
    file_type: 'image' | 'video' | 'text';
    start_offset_sec?: number;
    end_offset_sec?: number;
    interval_sec?: number;
    segment?: number;
    brand?: string;
    modifier?: string;
    color?: string;
    coordinates?: string;
    pick_point?: string;
    datetime_taken?: string;
    embedding_id?: string;
    material?: string;
    original_s3_uri?: string;
    robot?: string;
    shape?: string;
    comment?: string;
    labeler_name?: string;
    timestamp?: string;
  };
}

export default function Home() {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<Result[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);
  const [totalVectors, setTotalVectors] = useState<number | null>(null);
  const [isSearchComplete, setIsSearchComplete] = useState<boolean>(false);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'video' | null>(null);
  const [isInputEmpty, setIsInputEmpty] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Record<string, any> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 30;
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedShape, setSelectedShape] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedLabeler, setSelectedLabeler] = useState<string>('');
  
  const openEditModal = (metadata: any) => {
    setEditMetadata(metadata);
    setIsEditModalOpen(true);
  };
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClass(e.target.value);
  };
  const router = useRouter();

  const filteredResults = results.filter(result => {
    const m = result.metadata.material ?? '';
    const b = result.metadata.brand ?? '';
    const s = result.metadata.shape ?? '';
    const col = result.metadata.color ?? '';
    const lab = result.metadata.labeler_name ?? '';

    const passMaterial = selectedMaterial === '' || m === selectedMaterial;
    const passBrand = selectedBrand === '' || b === selectedBrand;
    const passShape = selectedShape === '' || s === selectedShape;
    const passColor = selectedColor === '' || col === selectedColor;
    const passLabeler = selectedLabeler === '' || lab === selectedLabeler;

    return passMaterial && passBrand && passShape && passColor && passLabeler;
  });

  // const filteredResults = selectedClass
  //   ? results.filter(result => result.metadata.class === selectedClass)
  //   : results;
  const suggestions = [
    "red coke can",
    "green plastic",
    "cardboard"
  ];
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setIsInputEmpty(false);
    setShowSuggestions(false);
  };

  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * resultsPerPage,
    currentPage * resultsPerPage
  );  

  const materialOptions = Array.from(new Set(results.map(r => r.metadata.material).filter(Boolean))) as string[];
  const brandOptions = Array.from(new Set(results.map(r => r.metadata.brand).filter(Boolean))) as string[];
  const shapeOptions = Array.from(new Set(results.map(r => r.metadata.shape).filter(Boolean))) as string[];
  const colorOptions = Array.from(new Set(results.map(r => r.metadata.color).filter(Boolean))) as string[];
  const labelerOptions = Array.from(new Set(results.map(r => r.metadata.labeler_name).filter(Boolean))) as string[];

  const handleMaterialChange = (value: string) => {
    setSelectedMaterial(value);
    setCurrentPage(1);
  };
  const handleBrandChange = (value: string) => {
    setSelectedBrand(value);
    setCurrentPage(1);
  };
  const handleShapeChange = (value: string) => {
    setSelectedShape(value);
    setCurrentPage(1);
  };
  const handleColorChange = (value: string) => {
    setSelectedColor(value);
    setCurrentPage(1);
  };
  const handleLabelerChange = (value: string) => {
    setSelectedLabeler(value);
    setCurrentPage(1);
  };

  const clearResults = () => {
    setQuery('');
    setResults([]);
    setIsInputEmpty(true);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType(null);

    setSelectedMaterial('');
    setSelectedBrand('');
    setSelectedShape('');
    setSelectedColor('');
    setSelectedLabeler('');
    setSelectedClass('');

    setErrorMessage(null);
  };

  const clearAllFilters = () => {
    setSelectedMaterial('');
    setSelectedBrand('');
    setSelectedShape('');
    setSelectedColor('');
    setSelectedLabeler('');
    setCurrentPage(1);
  };

  const playersRef = useRef<{ [key: string]: VideoJsPlayer }>({});

  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const totalPages = Math.ceil(filteredResults.length / resultsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);


  useEffect(() => {
    const pageViewData = {
      timestamp: new Date().toISOString(),
      screenSize: `${window.screen.width}x${window.screen.height}`,
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      browserName: navigator.userAgent,
      referrer: document.referrer,
      loadTime: performance.now(),
      language: navigator.language,
      totalVectors: totalVectors,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    };

    track('page_viewed', pageViewData);
  }, [totalVectors]);

  useEffect(() => {

    const fetchTotalVectors = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/index/info`);
        setTotalVectors(response.data.total_vectors);
      } catch (error) {
        console.error('Error fetching total vectors:', error);
      }
    };

    fetchTotalVectors();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(playersRef.current).forEach(player => {
        if (player && typeof player.dispose === 'function') {
          player.dispose();
        }
      });
      playersRef.current = {};
    };
  }, []);

  useEffect(() => {
    results.forEach((result, index) => {
      if (result.metadata.file_type === 'video') {
        const videoId = getVideoId(result, index);
        const videoElement = document.getElementById(videoId) as HTMLVideoElement;

        if (videoElement && !playersRef.current[videoId]) {
          const player = videojs(videoElement, {
            aspectRatio: '1:1',
            fluid: true,
            controls: true,
            muted: true,
            preload: 'auto'
          });

          player.one('ready', () => {
            player.currentTime(result.metadata.start_offset_sec);
          });

          playersRef.current[videoId] = player;
        }
      }
    });

    return () => {
      Object.keys(playersRef.current).forEach(videoId => {
        if (!results.some((result, index) => getVideoId(result, index) === videoId)) {
          playersRef.current[videoId].dispose();
          delete playersRef.current[videoId];
        }
      });
    };
  }, [results]);

  const resetSearchState = () => {
    setResults([]);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType(null);
    setErrorMessage(null);
    setCurrentPage(1);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (isInputEmpty) return;

    setShowSuggestions(false);

    resetSearchState();

    setIsSearching(true);
    setIsSearchComplete(false);
    setSearchTime(null);
    setSearchType('text');
    setErrorMessage(null);
    setIsLoadingResults(true);
    const startTime = Date.now();
    try {
      const response = await axios.post(`${API_URL}/api/search/text`, { query });
      setResults(response.data.results);
      const endTime = Date.now();
      setSearchTime(endTime - startTime);
      setIsSearchComplete(true);
      track('search_results', {
        searchType,
        query,
        searchTime
      });
    } catch (error) {
      console.error('Error during text search:', error);
      if (axios.isAxiosError(error) && error.response) {
        setErrorMessage(`Oops! ${error.response.data.detail || 'An unexpected error occurred'}`);
      } else {
        setErrorMessage('Oops! An unexpected error occurred. Our engineers have been notified.');
      }
    } finally {
      setIsSearching(false);
      setIsLoadingResults(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsInputEmpty(value.trim() === '');
    setShowSuggestions(value.trim() !== '');
  };

  const handleFileUploadWrapper = async (file: File) => {
    resetSearchState();
    await handleFileUpload(file, {
      API_URL,
      setSearchType,
      setErrorMessage,
      setIsUploading,
      setIsSearchComplete,
      setSearchTime,
      setIsLoadingResults,
      setResults,
      setQuery,
      setIsInputEmpty,
      setIsSearching
    });
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      track('file_selected');
      await handleFileUploadWrapper(e.target.files[0]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      track('file_dropped');
      await handleFileUploadWrapper(e.dataTransfer.files[0]);
    }
  };

  const getScoreLabel = (score: number) => {
    return { score: score.toFixed(4) };
  };

  const getVideoId = (result: Result, index: number) => `video-${index}-${result.metadata.s3_file_path}`;

  return (
    <Layout>
      <Head>
        <title>Universal Database of Images</title>
      </Head>
      <div
        className={`flex flex-col items-center justify-start min-h-screen bg-gray-100 ${dragging ? 'border-4 border-dashed border-blue-500' : ''
          }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ fontFamily: "'Inter', 'Helvetica', 'Arial', sans-serif" }}
      >
        <div className="max-w-8xl w-full px-8 md:px-12 mt-10 mx-auto">
          <Header />

          <div className="max-w-xl mx-auto relative ">


            <SearchForm
              query={query}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              handleFileChange={handleFileChange}
              isInputEmpty={isInputEmpty}
              isUploading={isUploading}
              isSearching={isSearching}
              clearResults={clearResults}
              suggestions={suggestions}
              handleSuggestionClick={handleSuggestionClick}
              showSuggestions={showSuggestions}
              handleFocus={handleFocus}
              openModal={openModal}
            />
            {/* <div className="mt-4">
              <ClassFilter
                selectedClass={selectedClass}
                onClassChange={handleClassChange}
                availableClasses={Array.from(
                  new Set(
                    results.map((result) => result.metadata.class).filter((cls): cls is string => cls !== undefined)
                  )
                )}
              />
            </div> */}

            {errorMessage && (
              <div className="w-full mt-4 text-red-500 text-center">
                {errorMessage}
              </div>
            )}
            {(isUploading || isSearching) && (
              <div className="w-full mt-8 flex items-center justify-center">
                <span className="text-gray-500 pulse">
                  {isUploading
                    ? 'Uploading, embedding, and searching...'
                    : 'Searching...'}
                </span>
                <div className="ml-3 spinner border-4 border-t-transparent border-indigo-300 rounded-full w-6 h-6 animate-spin"></div>
              </div>
            )}
          </div>

          {uploadStatus && (
            <div
              className={`mt-4 p-2 rounded ${uploadStatus.includes("successful")
                ? "bg-green-100 text-green-800"
                : "bg-red-100 text-red-800"
                }`}
            >
              {uploadStatus}
            </div>
          )}

        

          <div>
            {isSearchComplete && searchTime !== null && totalVectors !== null && (
              <div className="ml-2 mt-6 mb-4 flex items-center text-left text-gray-700">
                <p>
                  Searched {totalVectors.toLocaleString()} objects
                  {searchType === 'text' && (
                    <>
                      {' '}
                      for <strong className="text-indigo-800">{query}</strong>
                    </>
                  )}
                  {searchType === 'image' && (
                    <>
                      {' '}
                      for{' '}
                      <strong className="text-indigo-800">your image</strong>
                    </>
                  )}
                  {searchType === 'video' && (
                    <>
                      {' '}
                      for{' '}
                      <strong className="text-indigo-800">your video</strong>
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={clearResults}
                  className="text-gray-400 hover:text-gray-500 mb-0.4 ml-2 focus:outline-none"
                  disabled={isUploading || isSearching}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </button>
              </div>
            )}
            {/* Show filter panel only if we have results */}
            <div className='ml-2'>
              {results.length > 0 && (
              <FilterPanel
                materialOptions={materialOptions}
                brandOptions={brandOptions}
                shapeOptions={shapeOptions}
                colorOptions={colorOptions}
                labelerOptions={labelerOptions}
                selectedMaterial={selectedMaterial}
                selectedBrand={selectedBrand}
                selectedShape={selectedShape}
                selectedColor={selectedColor}
                selectedLabeler={selectedLabeler}
                onMaterialChange={handleMaterialChange}
                onBrandChange={handleBrandChange}
                onShapeChange={handleShapeChange}
                onColorChange={handleColorChange}
                onLabelerChange={handleLabelerChange}
                onClearFilters={clearAllFilters}
              />
            )}
            </div>
          
            <ResultsDisplay
              apiUrl={`${API_URL}/api`}
              isLoadingResults={isLoadingResults}
              results={paginatedResults}
              getScoreLabel={getScoreLabel}
              getVideoId={getVideoId}
              onEdit={openEditModal}
            />
            {results.length > 0 && (
              <div className="flex justify-center mt-4 space-x-2">
              {/* Previous Button */}
              <button
                className={`px-4 py-2 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 ${
                  currentPage === 1 ? 'cursor-not-allowed opacity-50' : ''
                }`}
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
              >
                Previous
              </button>
            
              {/* First Page Button */}
              {currentPage > 3 && (
                <>
                  <button
                    className="px-3 py-1 text-sm rounded-lg bg-gray-200 hover:bg-gray-300"
                    onClick={() => setCurrentPage(1)}
                  >
                    1
                  </button>
                  <span className="px-2 text-gray-500">...</span>
                </>
              )}
            
              {/* Dynamic Page Numbers */}
              {Array.from(
                { length: Math.min(5, totalPages) }, // Show up to 5 pages
                (_, index) => {
                  const page = currentPage - 2 + index;
                  if (page > 0 && page <= totalPages) {
                    return (
                      <button
                        key={page}
                        className={`px-3 py-1 text-sm rounded-lg ${
                          currentPage === page
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    );
                  }
                  return null;
                }
              )}
            
              {/* Last Page Button */}
              {currentPage < totalPages - 2 && (
                <>
                  <span className="px-2 text-gray-500">...</span>
                  <button
                    className="px-3 py-1 text-sm rounded-lg bg-gray-200 hover:bg-gray-300"
                    onClick={() => setCurrentPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                </>
              )}
            
              {/* Next Button */}
              <button
                className={`px-4 py-2 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 ${
                  currentPage === totalPages ? 'cursor-not-allowed opacity-50' : ''
                }`}
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
            
            )}

          </div>
        </div>

        <UploadModal
          isOpen={isModalOpen}
          onClose={closeModal}
          apiUrl={`${API_URL}/api`}
          setUploadStatus={setUploadStatus}
        />

        <EditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          apiUrl={`${API_URL}/api`}
          metadata={editMetadata || {}}
          setEditStatus={(status) => console.log(status)}
        />

        <Footer />
      </div>
    </Layout>
  );

}
