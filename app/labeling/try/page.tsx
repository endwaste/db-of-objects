"use client";

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import SlidingMenu from "../../components/SlidingMenu"; // Adjust import path
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";

// Adjust to your environment logic
const BASE_API = (() => {
  switch (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    case "development":
      return process.env.NEXT_PUBLIC_DEVELOPMENT_URL || "http://localhost:8000";
    case "production":
      return (
        process.env.NEXT_PUBLIC_PRODUCTION_URL ||
        "http://ec2-44-243-22-197.us-west-2.compute.amazonaws.com:8000"
      );
    default:
      return "http://localhost:8000";
  }
})();

interface Detection {
    box: number[]; // [x1, y1, x2, y2] in original image pixels
    confidence: number;
    pinecone_score?: number | null;
    pinecone_metadata?: {
      color?: string;
      shape?: string;
      material?: string;
      brand?: string;
    };
  }
  
  interface DetectInferResponse {
    status: string;
    image_size: { width: number; height: number };
    num_detections: number;
    detections: Detection[];
  }
  
  export default function DetectInferMetadataPage() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imageUrl, setImageUrl] = useState<string>("");
  
    // Detection data from the server
    const [detections, setDetections] = useState<Detection[]>([]);
    const [originalWidth, setOriginalWidth] = useState(0);
    const [originalHeight, setOriginalHeight] = useState(0);
  
    // Displayed image dimensions
    const [displayedWidth, setDisplayedWidth] = useState(0);
    const [displayedHeight, setDisplayedHeight] = useState(0);
  
    // Thresholds
    const [detectThreshold, setDetectThreshold] = useState(0.0);
    const [similarityThreshold, setSimilarityThreshold] = useState(0.0);
  
    // Loading & Hover
    const [isLoading, setIsLoading] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
    // Ref to measure the displayed image size
    const imgRef = useRef<HTMLImageElement>(null);
  
    // --------------------------------------------------------------------------
    // File selection
    // --------------------------------------------------------------------------
    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
      if (event.target.files && event.target.files.length > 0) {
        setSelectedFile(event.target.files[0]);
      }
    }
  
    // --------------------------------------------------------------------------
    // Upload & Detect (POST)
    // --------------------------------------------------------------------------
    async function handleUpload() {
      if (!selectedFile) {
        alert("No file selected");
        return;
      }
      setIsLoading(true);
  
      try {
        const formData = new FormData();
        formData.append("image_file", selectedFile);
  
        // POST to /api/detect_infer_metadata
        const res = await axios.post<DetectInferResponse>(
          `${BASE_API}/api/detect_infer_metadata`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );
  
        const data = res.data;
        console.log("DetectInfer response:", data);
  
        // Convert the file to a URL for display
        const url = URL.createObjectURL(selectedFile);
        setImageUrl(url);
  
        // Store bounding box data
        setDetections(data.detections);
        setOriginalWidth(data.image_size.width);
        setOriginalHeight(data.image_size.height);
      } catch (error) {
        console.error("Error uploading/detecting:", error);
        alert("Detection failed. See console for details.");
      } finally {
        setIsLoading(false);
      }
    }
  
    // --------------------------------------------------------------------------
    // GET & Detect (via s3_uri param)
    // Example usage: 
    // handleS3Detection("s3://my-bucket/my-file.jpg");
    // --------------------------------------------------------------------------
    async function handleS3Detection(s3Uri: string) {
      setIsLoading(true);
      try {
        // GET request with s3_uri in query param
        const url = `${BASE_API}/api/detect_infer_metadata?s3_uri=${encodeURIComponent(s3Uri)}`;
        const res = await axios.get<DetectInferResponse>(url);
  
        const data = res.data;
        console.log("DetectInfer (GET) response:", data);
  
        // We won't have a local image file, so we can't display 
        // the actual image on the page unless we do a presigned URL approach.
        // For demonstration, we'll skip display if we only have S3 data.
        setImageUrl(""); // or set to a placeholder if needed
  
        setDetections(data.detections);
        setOriginalWidth(data.image_size.width);
        setOriginalHeight(data.image_size.height);
      } catch (error) {
        console.error("GET detection error:", error);
        alert("Failed to detect from S3 URI. See console.");
      } finally {
        setIsLoading(false);
      }
    }
  
    // --------------------------------------------------------------------------
    // Measure displayed image after it loads
    // --------------------------------------------------------------------------
    useEffect(() => {
      if (imgRef.current) {
        const handleLoad = () => {
          if (imgRef.current) {
            setDisplayedWidth(imgRef.current.offsetWidth);
            setDisplayedHeight(imgRef.current.offsetHeight);
          }
        };
        const imageEl = imgRef.current;
        imageEl.addEventListener("load", handleLoad);
  
        return () => {
          imageEl.removeEventListener("load", handleLoad);
        };
      }
    }, [imageUrl]);
  
    // --------------------------------------------------------------------------
    // Render bounding boxes
    // --------------------------------------------------------------------------
    function renderDetections() {
      if (!imgRef.current || !originalWidth || !originalHeight) {
        return null;
      }
  
      // Calculate scale factor
      const scaleX = displayedWidth / originalWidth;
      const scaleY = displayedHeight / originalHeight;
  
      return detections.map((d, index) => {
        const [x1, y1, x2, y2] = d.box;
        const left = x1 * scaleX;
        const top = y1 * scaleY;
        const widthPx = (x2 - x1) * scaleX;
        const heightPx = (y2 - y1) * scaleY;
  
        // Show/hide box based on confidence
        const shouldShowBox = d.confidence >= detectThreshold;
  
        // Check if Pinecone metadata is "visible"
        const meetsSimThreshold =
          d.pinecone_score != null && d.pinecone_score >= similarityThreshold;
  
        // If meetsSimThreshold AND there is actual metadata => build tooltip
        let tooltip = "";
        if (meetsSimThreshold && d.pinecone_metadata && Object.keys(d.pinecone_metadata).length > 0) {
          tooltip = `Color: ${d.pinecone_metadata?.color || "?"}
Shape: ${d.pinecone_metadata?.shape || "?"}
Material: ${d.pinecone_metadata?.material || "?"}
Brand: ${d.pinecone_metadata?.brand || "?"}`;
        } else {
          tooltip = "No metadata above the given threshold";
        }
  
        // Color: if metadata is not shown => RED, otherwise BLUE
        const colorIfNoMetadata = "#EF4444"; // red
        const colorIfHasMetadata = "#3B82F6"; // blue
        const isHovering = hoveredIndex === index;
  
        // Decide box color
        let boxColor = colorIfNoMetadata;
        if (meetsSimThreshold) {
          // If we meet similarity threshold => show metadata => use blue
          boxColor = colorIfHasMetadata;
        }
  
        // If hovering, make it slightly darker or a different shade
        let hoverColor = meetsSimThreshold ? "#2563EB" : "#DC2626"; // darker shade
        const borderColor = isHovering ? hoverColor : boxColor;
  
        const boxStyle: React.CSSProperties = {
          position: "absolute",
          border: `2px solid ${borderColor}`,
          left: `${left}px`,
          top: `${top}px`,
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          transition: "border-color 0.2s",
          display: shouldShowBox ? "block" : "none",
        };
  
        return (
          <div
            key={index}
            style={boxStyle}
            title={tooltip}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        );
      });
    }
  
    // --------------------------------------------------------------------------
    // UI
    // --------------------------------------------------------------------------
    return (
      <div style={{ background: "#f3f4f6", minHeight: "100vh" }}>
        {/* Sliding Menu */}
        <SlidingMenu />
  
        {/* Main Content */}
        <div
          style={{
            padding: "2.5rem",
            fontFamily: "'Inter', sans-serif",
            textAlign: "center",
          }}
        >
          {/* Logo + Title */}
          <img
            src="https://endwaste.io/assets/logo_footer.png"
            alt="Glacier Logo"
            style={{
              width: "80px",
              height: "auto",
              marginBottom: "0.5rem",
              display: "block",
              margin: "0 auto",
            }}
          />
          <h1 className="font-sans text-4xl mb-3" style={{ color: "#466CD9" }}>
            Universal database of objects
          </h1>
  
          {/* White Box */}
          <div
            style={{
              marginTop: "40px",
              display: "inline-block",
              padding: "20px",
              backgroundColor: "#fff",
              borderRadius: "8px",
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              maxWidth: "1200px",
              width: "100%",
              textAlign: "left",
            }}
          >
            {/* Instructions */}
            <p
              className="font-sans text-base mb-5 text-gray-900"
              style={{ textAlign: "center", lineHeight: "1.5" }}
            >
              <strong>Labeling with the UDO</strong> <br />
              1) Click “Browse” to select an image, then “Upload &amp; Detect.” <br />
              2) Adjust the <em>Detect Anything Threshold</em> to select the bounding box confidence. <br />
              3) Adjust the <em>Image Similarity Threshold</em> to select the threshold to hide and show metadata. <br />
              4) Hover over a bounding box to see metadata if it&apos;s above your similarity threshold.<br />
                 Otherwise, the box is drawn in red, indicating no metadata is shown.
            </p>
  
            {/* Upload */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                id="fileUpload"
                style={{ display: "none" }}
              />
              <label htmlFor="fileUpload">
                <span
                  style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    backgroundColor: "#E5E7EB",
                    color: "#374151",
                    borderRadius: "4px",
                    cursor: "pointer",
                    marginRight: "10px",
                  }}
                >
                  Browse
                </span>
              </label>
              {selectedFile && (
                <span
                  style={{
                    marginLeft: "6px",
                    color: "#374151",
                    fontSize: "14px",
                    fontStyle: "italic",
                  }}
                >
                  {selectedFile.name}
                </span>
              )}
              <button
                onClick={handleUpload}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#3B82F6",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginLeft: "20px",
                }}
              >
                {isLoading ? "Detecting..." : "Upload & Detect"}
              </button>
            </div>
  
            {/* Sliders */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "2rem",
                marginBottom: "20px",
                flexWrap: "wrap",
              }}
            >
              {/* Detect Anything Threshold */}
              <div style={{ minWidth: "200px" }}>
                <label
                  htmlFor="detectThreshold"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: "bold",
                    marginBottom: "6px",
                    justifyContent: "center",
                  }}
                >
                  <span>Detect Anything Threshold: {detectThreshold.toFixed(2)}</span>
                  <div
                    style={{
                      marginLeft: "6px",
                      cursor: "help",
                      borderRadius: "50%",
                      border: "1px solid #999",
                      width: "16px",
                      height: "16px",
                      textAlign: "center",
                      fontSize: "12px",
                      lineHeight: "14px",
                      background: "#eee",
                    }}
                    title="Objects with confidence below this are hidden."
                  >
                    ?
                  </div>
                </label>
                <input
                  id="detectThreshold"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={detectThreshold}
                  onChange={(e) => setDetectThreshold(parseFloat(e.target.value))}
                  style={{
                    width: "100%",
                    appearance: "none",
                    height: "6px",
                    borderRadius: "3px",
                    background: "#E5E7EB",
                    outline: "none",
                  }}
                />
              </div>
  
              {/* Image Similarity Threshold */}
              <div style={{ minWidth: "200px" }}>
                <label
                  htmlFor="similarityThreshold"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: "bold",
                    marginBottom: "6px",
                    justifyContent: "center",
                  }}
                >
                  <span>Image Similarity Threshold: {similarityThreshold.toFixed(2)}</span>
                  <div
                    style={{
                      marginLeft: "6px",
                      cursor: "help",
                      borderRadius: "50%",
                      border: "1px solid #999",
                      width: "16px",
                      height: "16px",
                      textAlign: "center",
                      fontSize: "12px",
                      lineHeight: "14px",
                      background: "#eee",
                    }}
                    title="Pinecone metadata shown only if above this score."
                  >
                    ?
                  </div>
                </label>
                <input
                  id="similarityThreshold"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                  style={{
                    width: "100%",
                    appearance: "none",
                    height: "6px",
                    borderRadius: "3px",
                    background: "#E5E7EB",
                    outline: "none",
                  }}
                />
              </div>
            </div>
  
            {/* Image + bounding boxes container */}
            {imageUrl && (
              <div
                style={{
                  position: "relative",
                  margin: "0 auto",
                  display: "inline-block", // wraps exactly the image
                }}
              >
                <img
                  ref={imgRef}
                  src={imageUrl}
                  alt="Uploaded"
                  style={{
                    display: "block",
                    maxWidth: "99%", // bigger image
                    height: "auto",
                  }}
                />
                {renderDetections()}
              </div>
            )}
            <hr style={{ margin: "30px auto", width: "80%" }} />
  
            {/* Code snippet below the image */}
            <div
              style={{

                marginBottom: "20px",
                textAlign: "center",
              }}
            >
              <p
                className="font-sans text-base mb-5 text-gray-900"
                style={{ lineHeight: "1.5", marginBottom: "10px" }}

              >
        
                <strong>Label with the UDO using the endpoint:</strong>
              </p>
              <pre
                style={{
                    backgroundColor: "#f3f4f6",
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    textAlign: "left",
                    overflowX: "auto",
                    lineHeight: "1.4",
                    margin: "0 auto",
                    maxWidth: "800px",
                }}
                >
                <SyntaxHighlighter language="python" style={prism}>
                    {`import requests

# Define base API URL
BASE_API = "${BASE_API}"

# Replace with your actual S3 URI
s3_uri = "s3://my-bucket/my-image.jpg"

# Construct the GET request URL
url = f"{BASE_API}/api/detect_infer_metadata?s3_uri={s3_uri}"

# Make the GET request
response = requests.get(url)

# Print the response
if response.status_code == 200:
    data = response.json()
    print("S3 Detection Response:", data)
else:
    print("Error:", response.status_code, response.text)

"""
Example Response:
{
    "status": "ok",
    "image_size": {
        "width": 1024,
        "height": 768
    },
    "num_detections": 2,
    "detections": [
        {
            "box": [100, 200, 400, 600],
            "confidence": 0.92,
            "pinecone_score": 0.87,
            "pinecone_metadata": {
                "color": "red",
                "shape": "circular",
                "material": "plastic",
                "brand": "BrandX"
            }
        },
        {
            "box": [50, 50, 300, 300],
            "confidence": 0.85,
            "pinecone_score": 0.78,
            "pinecone_metadata": {
                "color": "blue",
                "shape": "rectangular",
                "material": "metal",
                "brand": "BrandY"
            }
        }
    ]
}
"""
`}
                </SyntaxHighlighter>
                </pre>

            </div>
          </div>
        </div>
      </div>
    );
  }