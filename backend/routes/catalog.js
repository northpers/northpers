const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { cachedQuery, invalidateByPrefix } = require("../config/redis");
const fs = require("fs");
const path = require("path");
const flashDiscount = require("../utils/flashDiscount");
const { aiRecAllowed } = require("../utils/aiRecGate");
const { sendCopilotPrompt } = require("../services/copilotAiClient");
const { filterCatalogProducts } = require("../utils/catalogFilters");
const { loadStorePolicies } = require("../utils/storePolicies");

const SIZE_EXTRA = { S: 0, M: 500, L: 1000, XL: 1500, XXL: 2000 };

const NORTHLINE_CATALOG = [
  {
    id: 1,
    name: "Northline - ShortSleeve Default Outline Boxy Tee ",
    price: 113000,
    oldPrice: 250000,
    avgRating: 4.4,
    totalReviews: 7102,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_NorthDefault_BlackStatement.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000070c8206af055bdf544ef63d~2.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Black"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Boxy Style North Default .\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Black\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 13,
    name: "Northline - Shortsleeve Heritage",
    price: 119000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 10800,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_archive_WhiteStatement.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/Models/file_000000002cc481fa9ab4b215b5eb424d7.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/Models/file_0000000023d482079608b212e73b67a3~2.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Heritage.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Black\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 18,
    name: "Northline - Longsleeve Shirt Beyond.",
    price: 127000,
    oldPrice: 250000,
    avgRating: 4.6,
    totalReviews: 10100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/Kemeja.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartLongTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 1,
    deskripsi:
      "Northline - LongSleeve Shirt Beyond.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: LongSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 23,
    name: "Northline - ShortSleeve Rebel Manifesto Boxy Tee.",
    price: 115000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 50400,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_ArticleSept3_BlackStatement.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000a19c820bb6efe95cb479c4492.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Black"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Rebel Manifesto Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Black\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 24,
    name: "Northline - ShortSleeve The Message Dual-Language Boxy Tee.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 4.8,
    totalReviews: 20100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineTheMessageDualLanguageBoxyTee.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Black"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve The Message Dual-Language Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Black\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 25,
    name: "Northline - ShortSleeve Utility Metal Plate Boxy Tee.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 40900,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_ArticleSept1_WhiteStatement.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_000000002cc481fa9ab4b215b5eb424d3.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000022881fa934410ad2b2853ec~2.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Utility Metal Plate Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 27,
    name: "Northline - ShortSleeve Equine Speed Boxy Tee.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 4.5,
    totalReviews: 20100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_ArticleSept6_BlackStatement.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Black"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Equine Speed Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Black\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 28,
    name: "Northline - ShortSleeve Red Jawi.",
    price: 109000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 50100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineRedJawiTypographyBoxyTee.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000bd3c81faae3ccf754d5a784c2.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Red Jawi.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 29,
    name: "Northline - ShortSleeve Manifesto Boxy Tee.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 40300,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/Manifesto.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/Models/file_000000002cc481fa9ab4b215b5eb424d8.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000022881fa934410ad2b2853ec~3.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Manifesto Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 30,
    name: "Northline - ShortSleeve Subtle Jawi Edge Tee.",
    price: 109000,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 50100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineSubtleJawiEdgeTeeFront.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineSubtleJawiEdgeTeeBack.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Subtle Jawi Edge Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 31,
    name: "Northline - Shortsleeve Orbital Puffer.",
    price: 108880,
    oldPrice: 250000,
    avgRating: 5,
    totalReviews: 40500,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/NorthlineShortSleeveBoxyStyle_NorthDefault_WhiteStatement.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_000000002cc481fa9ab4b215b5eb424d6.webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/Models/file_00000000e2ec81faac185150db1de4f1(1).webp?v=20260827",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Shortsleeve Orbital Puffer.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 35,
    name: "Northline - LongSleeve Waffle Iconic.",
    price: 203000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 60200,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/Northline.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartLongTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - LongSleeve Waffle Iconic.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: LongSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 36,
    name: "Northline - ShortSleeve Speedway Connect Boxy Tee.",
    price: 117000,
    oldPrice: 250000,
    avgRating: 4.8,
    totalReviews: 50900,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260930_005409.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260930_005530.webp?v=20260829",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - ShortSleeve Speedway Connect Boxy Tee.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 37,
    name: "Northline - LongSleeve Iconic Logo Boxy Raglan.",
    price: 176000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 60200,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/file_0000000000ac81faa864f998eb6d94f5.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/file_00000000d3c881faaed6b2d9395756e4.webp?v=20260829",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartLongTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - LongSleeve Iconic Logo Boxy Raglan.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: LongSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 38,
    name: "Northline - LongSleeve Cheongsam.",
    price: 223000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 40600,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/Cheongsam.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartLongTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - LongSleeve Cheongsam.\n\n        Archive Article dari Northline dengan desain Black Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: LongSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 39,
    name: "Northline - New Article Orbital.",
    price: 163000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 30200,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260923_181045.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260923_180851.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Blue"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - New Article Orbital.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Blue\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 40,
    name: "Northline - Flanel Label.",
    price: 223000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 50100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260919_211743.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["Flanel"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Flanel Label.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: Flanel\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 41,
    name: "Northline - Shortsleeve Star.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 20100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260919_082957.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260919_083045.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Shortsleeve Star.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 42,
    name: "Northline - Shortsleeve NWB.",
    price: 113000,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 40100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20260925_172504.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Shortsleeve NWB.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 43,
    name: "Northline - Shortsleeve Orbital Branding.",
    price: 68880,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 50100,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/OrbitalBranding.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/OrbitalBranding1.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Shortsleeve Orbital Branding.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: ShortSleeve Boxy T-Shirt\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Pendek\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 44,
    name: "Northline - Doublesleeve Recon.",
    price: 158880,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 60400,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20261005_144350.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20261008_132640.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartLongTshirt.webp?v=20260827",
    ],
    colors: ["White"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Doublesleeve Recon.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: Doublesleeve\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 45,
    name: "Northline - Hoodie Hevypers.",
    price: 172880,
    oldPrice: 250000,
    avgRating: 12,
    totalReviews: 50600,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/file_00000000caa08211b57f69c65e86dbae.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/file_000000006eb4820798ef6019a2b68152.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/SizeChart/SizeChartHoodieBoxy.webp?v=20260827",
    ],
    colors: ["Navy"],
    sizes: ["M", "L", "XL"],
    stock: 5,
    deskripsi:
      "Northline - Hoodie Hevypers.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: Doublesleeve\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 46,
    name: "Northline - Cheong Track Heavypers.",
    price: 118880,
    oldPrice: 250000,
    avgRating: 10,
    totalReviews: 50600,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/نورثلاين(12).webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/نورثلاين(13).webp?v=20260828",
    ],
    colors: ["Pink"],
    sizes: ["All Size"],
    stock: 5,
    deskripsi:
      "Northline - Cheong Track Heavypers.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: Doublesleeve\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
  {
    id: 47,
    name: "Northline - Belt Perspective",
    price: 43880,
    oldPrice: 250000,
    avgRating: 10,
    totalReviews: 40800,
    images: [
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/beltpers.webp?v=20260828",
      "https://nl.hostinesia.my.id/public/image/NorthlineArticles/20261023_090041.webp?v=20260828",
    ],
    colors: ["Black"],
    sizes: ["All Size"],
    stock: 5,
    deskripsi:
      "Northline - Belt Perspective.\n\n        Archive Article dari Northline dengan desain Blue Statement yang menghadirkan karakter minimalis dan modern. \n        Menggunakan potongan boxy fit dengan siluet relaxed sehingga memberikan tampilan casual dan contemporary.\n\n        Detail Produk:\n\n        Brand: Northline\n        Model: Doublesleeve\n        Article: Archive Article\n        Warna: White\n        Fit: Boxy / Relaxed Fit\n        Lengan: Panjang\n        Material: Cotton\n        Cocok untuk penggunaan sehari-hari\n        Unisex\n\n        Catatan:\n        Mohon perhatikan panduan ukuran sebelum melakukan pemesanan. \n        Warna produk dapat terlihat sedikit berbeda tergantung pencahayaan dan layar perangkat.\n\n        #Northline #ArchiveArticle #BoxyTshirt #BlackStatement #BoxyFit #CasualWear",  
  },
];

const crypto = require("crypto");

function getProductCode(id) {
  return (
    "nrt-" +
    crypto
      .createHash("sha256")
      .update("northline-" + id)
      .digest("hex")
      .slice(0, 12)
  );
}

const FEATURED_IDS = [13, 12, 11, 10, 9, 8];

function getCategories(product) {
  const n = String(product.name || "").toLowerCase();
  const cats = [];
  if (/hoodie/.test(n)) cats.push("hoodie");
  if (/short\s*sleeve/.test(n)) cats.push("shortsleeve");
  if (/long\s*sleeve/.test(n)) cats.push("longsleeve");
  if (/work\s*shirt/.test(n)) cats.push("workshirt");
  return cats;
}

function findCatalogProduct(ref) {
  if (!ref) return null;
  const key = String(ref).trim().toLowerCase();
  let p = NORTHLINE_CATALOG.find((x) => getProductCode(x.id) === key);
  if (!p) {
    const idMatch = key.match(/^\d+$/);
    if (idMatch) {
      p = NORTHLINE_CATALOG.find((x) => String(x.id) === key);
    }
  }
  return p || null;
}

function dummyReviewMeta(productId) {
  const n = Math.abs(Number(productId) * 9301 + 49297) % 1000;
  const ratings = [4.0, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0];
  const counts = [
    5400, 5800, 6200, 6600, 7100, 7500, 8100, 8700, 9200, 9800, 10800,
  ];
  return {
    avgRating: ratings[n % ratings.length],
    totalReviews: counts[n % counts.length],
  };
}

function mergeRealReviews(productId, realCount, realAvg) {
  const dummy = dummyReviewMeta(productId);
  const realCountNum = Math.max(0, parseInt(realCount) || 0);
  const realAvgNum = Number(realAvg) || 0;
  const totalReviews = dummy.totalReviews + realCountNum;
  let avgRating = dummy.avgRating;
  if (realCountNum > 0 && realAvgNum > 0) {
    avgRating =
      Math.round(
        ((dummy.avgRating * dummy.totalReviews + realAvgNum * realCountNum) /
          totalReviews) *
          10,
      ) / 10;
  }
  return { avgRating, totalReviews };
}

function thumbUrl(imageUrl) {
  const s = String(imageUrl || "").split("?")[0];
  const m = s.match(/\/public\/image\/(.+)\.[^.]+$/);
  if (!m) return imageUrl;
  const thumb =
    s.replace("/public/image/", "/public/image/opt/").replace(/\.[^.]+$/, "") +
    ".webp";
  const local = path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "public",
    "image",
    "opt",
    m[1].replace(/\.[^.]+$/, "") + ".webp",
  );
  try {
    if (fs.existsSync(local)) return thumb;
  } catch (e) {}
  return imageUrl;
}

function withCode(product) {
  const merged = mergeRealReviews(
    product.id,
    product.totalReviews || 0,
    product.avgRating || 0,
  );
  const thumbs = (product.images || []).map(thumbUrl);
  return {
    ...product,
    avgRating: merged.avgRating,
    totalReviews: merged.totalReviews,
    code: getProductCode(product.id),
    aiPick: aiPickIds().has(product.id),
    thumbs,
    categories: getCategories(product),
  };
}

async function computeUnitPriceWithFlash(catalogProduct, model, size, sizeGroup) {
  const base = computeUnitPrice(catalogProduct, model, size, sizeGroup);
  const sizeExtra = SIZE_EXTRA[String(size || "").toUpperCase()] || 0;
  const baseNoExtra = base - sizeExtra;
  try {
    const flash = await flashDiscount.getFlashState();
    if (flash.active) {
      const promo = flash.prices[String(catalogProduct.id)];
      if (promo && promo < baseNoExtra) {
        return promo + sizeExtra;
      }
    }
  } catch (e) {
    console.error("flash unit price skip:", e.message);
  }
  return base;
}

function computeUnitPrice(catalogProduct, model, size, sizeGroup) {
  if (
    String(sizeGroup || "").toUpperCase() === "CHILDREN" &&
    catalogProduct.childrenPrice
  ) {
    return catalogProduct.childrenPrice;
  }
  if (
    String(size || "").toUpperCase() === "CHILDREN" &&
    catalogProduct.childrenPrice
  ) {
    return catalogProduct.childrenPrice;
  }
  let base = 0;
  if (catalogProduct.priceLong && catalogProduct.priceShort) {
    base =
      String(model).toUpperCase() === "PANJANG"
        ? catalogProduct.priceLong
        : catalogProduct.priceShort;
  } else if (catalogProduct.priceShort) {
    base = catalogProduct.priceShort;
  } else {
    base = catalogProduct.price || 0;
  }
  return base + (SIZE_EXTRA[String(size || "").toUpperCase()] || 0);
}

let productsCache = null;
let productsCacheAt = 0;
const PRODUCTS_CACHE_TTL = 30 * 1000;

async function applyFlashPrices(list) {
  const flash = await flashDiscount.getFlashState();
  if (!flash.active) return { products: list, flashActive: false };
  return {
    products: list.map((p) => {
      const promo = flash.prices[String(p.id)];
      if (promo && promo < p.price) {
        return { ...p, price: promo, oldPrice: p.price, flashActive: true };
      }
      return p;
    }),
    flashActive: true,
  };
}

router.get("/products", async (req, res) => {
  let list;
  if (productsCache && Date.now() - productsCacheAt < PRODUCTS_CACHE_TTL) {
    list = productsCache;
  } else {
    list = NORTHLINE_CATALOG.map(withCode);
    try {
      const [rows] = await db.execute(
        "SELECT product_id, COUNT(*) c, AVG(rating) a FROM product_reviews GROUP BY product_id",
      );
      const real = {};
      rows.forEach((r) => {
        real[Number(r.product_id)] = {
          c: parseInt(r.c) || 0,
          a: r.a ? Math.round(Number(r.a) * 10) / 10 : 0,
        };
      });
      list = list.map((p) => {
        const r = real[Number(p.id)];
        if (r && r.c > 0) {
          const merged = mergeRealReviews(p.id, r.c, r.a);
          p.avgRating = merged.avgRating;
          p.totalReviews = merged.totalReviews;
        }
        return p;
      });
    } catch (e) {
      console.error("gabung reviews gagal:", e.message);
    }
    productsCache = list;
    productsCacheAt = Date.now();
  }
  const result = await applyFlashPrices(list);
  if (!(await aiRecAllowed(req))) {
    result.products = result.products.map((p) => ({ ...p, aiPick: false }));
  }
  const filtered = filterCatalogProducts(
    result.products,
    { ...req.query, search: req.query.search ?? req.query.q },
    getCategories,
  );
  if (filtered.error) {
    return res.status(400).json({ success: false, message: filtered.error });
  }
  res.json({ products: filtered.products, flashActive: result.flashActive });
});

router.get("/policies", async (req, res) => {
  try {
    const policies = await loadStorePolicies(db);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, policies });
  } catch (err) {
    console.error("Gagal memuat kebijakan toko:", err);
    return res.status(500).json({ success: false, message: "Gagal memuat kebijakan toko." });
  }
});

router.get("/flash-status", async (req, res) => {
  try {
    const flash = await flashDiscount.getFlashState();
    res.json({
      success: true,
      active: flash.active,
      prices: flash.prices,
      start: flash.config.flash_start || "17:45",
      end: flash.config.flash_end || "00:00",
      date: flash.config.flash_date || flash.config.flash_start_date || "",
      startDate: flash.config.flash_start_date || flash.config.flash_date || "",
      endDate: flash.config.flash_end_date || flash.config.flash_date || flash.config.flash_start_date || "",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/reviews", async (req, res) => {
  try {
    const { productId, rating } = req.query;
    const cacheKey = `catalog:reviews:${productId || "all"}:${rating || "all"}`;

    const data = await cachedQuery(cacheKey, 300, async () => {
      let where = "WHERE 1=1";
      const params = [];
      if (productId) {
        where += " AND c.product_id=?";
        params.push(parseInt(productId));
      }
      if (rating) {
        where += " AND c.rating=?";
        params.push(parseInt(rating));
      }

      const [rows] = await db.execute(
        `SELECT c.id, c.product_id, c.user_id, c.username, c.user_avatar, c.rating, c.rating_bahan, c.rating_ukuran, c.rating_warna,
                c.variant_color, c.variant_size, c.variant_model, c.review_text, c.images, c.verified_purchase,
                c.reply_text, c.reply_at, c.reply_by, c.created_at
         FROM product_reviews c
         ${where}
         ORDER BY c.created_at DESC, c.id DESC`,
        params,
      );

      const [aggRows] = await db.execute(
        `SELECT product_id, COUNT(*) as total, AVG(rating) as avg_rating
         FROM product_reviews
         WHERE product_id IN (SELECT DISTINCT product_id FROM product_reviews)
         GROUP BY product_id`,
      );

      const prodMeta = {};
      aggRows.forEach((r) => {
        prodMeta[r.product_id] = {
          totalReviews: r.total,
          avgRating: r.avg_rating
            ? Math.round(Number(r.avg_rating) * 10) / 10
            : 0,
        };
      });

      const reviewMap = new Map();
      NORTHLINE_CATALOG.forEach((p) => {
        const m = prodMeta[p.id] || { totalReviews: 0, avgRating: 0 };
        reviewMap.set(p.id, {
          id: p.id,
          name: p.name,
          image: (p.images && p.images[0]) || "/public/icons/default.webp",
                totalReviews: m.totalReviews,
          avgRating: m.avgRating,
        });
      });

      const allCounts = {};
      for (let i = 1; i <= 5; i++) allCounts[i] = 0;
      const byProduct = {};
      rows.forEach((r) => {
        if (!byProduct[r.product_id])
          byProduct[r.product_id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        byProduct[r.product_id][r.rating] =
          (byProduct[r.product_id][r.rating] || 0) + 1;
        allCounts[r.rating] = (allCounts[r.rating] || 0) + 1;
      });
      Object.keys(reviewMap).forEach((id) => {
        if (!byProduct[id]) byProduct[id] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviewMap.get(id).ratingCounts = byProduct[id];
      });

      // Produk id baru tanpa review DB -> isi otomatis dari template AI
      NORTHLINE_CATALOG.forEach((p) => {
        const meta = reviewMap.get(p.id);
        if (!meta || meta.totalReviews > 0) return;
        const tpl = aiReviewsForProduct(p.id);
        if (!tpl.length) return;
        const groups = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        tpl.forEach((r) => {
          groups[Math.min(5, Math.max(1, r.rating || 5))]++;
        });
        meta.totalReviews = 16 + tpl.length;
        meta.avgRating =
          Math.round(
            (tpl.reduce((s, r) => s + (r.rating || 5), 0) / tpl.length) * 10,
          ) / 10;
        meta.ratingCounts = groups;
        meta.aiGenerated = true;
      });

      const totalReviews = rows.length;
      const avg =
        totalReviews > 0
          ? Math.round(
              (rows.reduce((s, r) => s + (r.rating || 0), 0) / totalReviews) *
                10,
            ) / 10
          : 0;

      const reviews = rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        productName: (reviewMap.get(Number(r.product_id)) || {}).name || null,
        productImage:
          (reviewMap.get(Number(r.product_id)) || {}).image || null,
        userName: r.username,
        userAvatar: r.user_avatar,
        rating: r.rating,
        ratingBahan: r.rating_bahan,
        ratingUkuran: r.rating_ukuran,
        ratingWarna: r.rating_warna,
        variantColor: r.variant_color,
        variantSize: r.variant_size,
        variantModel: r.variant_model,
        images: r.images ? JSON.parse(r.images) : [],
        verified: !!r.verified_purchase,
        replyText: r.reply_text,
        replyAt: r.reply_at,
        replyBy: r.reply_by,
        text: r.review_text,
        createdAt: r.created_at,
      }));

      // Review virtual dari template AI untuk produk baru (tanpa review DB)
      if ((!productId || reviews.length === 0) && aiReviewTemplates.generatedAt) {
        const virtualTargets =
          productId && reviews.length === 0
            ? [String(productId)]
            : NORTHLINE_CATALOG.map((p) => String(p.id));
        const aiCreatedAt = new Date(aiReviewTemplates.generatedAt)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
        virtualTargets.forEach((pid) => {
          if (reviews.some((r) => String(r.productId) === pid)) return;
          const tpl = aiReviewsForProduct(pid);
          if (!tpl.length) return;
          tpl.forEach((r, i) => {
            reviews.push({
              id: -pid - 1 - i,
              productId: Number(pid),
              productName:
                (reviewMap.get(Number(pid)) || {}).name || null,
              productImage:
                (reviewMap.get(Number(pid)) || {}).image || null,
              userName: r.username || "Pembeli Northline",
              userAvatar: null,
              rating: Math.min(5, Math.max(1, r.rating || 5)),
              ratingBahan: null,
              ratingUkuran: null,
              ratingWarna: null,
              variantColor: null,
              variantSize: null,
              variantModel: null,
              images: [],
              verified: true,
              replyText: null,
              replyAt: null,
              replyBy: null,
              text: r.text || "",
              createdAt: aiCreatedAt,
              aiGenerated: true,
            });
          });
        });
      }

      return {
        success: true,
        totalReviews,
        avgRating: avg,
        ratingCounts: allCounts,
        aiGenerated: aiReviewTemplates.generatedAt > 0,
        products: Array.from(reviewMap.values()).filter(
          (p) => p.totalReviews > 0,
        ),
        reviews,
      };
    });

    res.json(data);
  } catch (err) {
    console.error("catalog reviews error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================
// AI Reviews otomatis (generate SEKALI, hemat token)
// =========================================
const AI_TEMPLATES_FILE = path.join(__dirname, "../ai-review-templates.json");
const AI_GEN_KEY = process.env.AI_GEN_KEY || "nl-ai-reviews-2026";

function loadAiReviewTemplates() {
  try {
    return JSON.parse(fs.readFileSync(AI_TEMPLATES_FILE, "utf8"));
  } catch (e) {
    return { generatedAt: 0, recommended: [], stores: {} };
  }
}

function saveAiReviewTemplates(tpl) {
  fs.writeFileSync(AI_TEMPLATES_FILE, JSON.stringify(tpl, null, 2), "utf8");
}

const aiReviewTemplates = loadAiReviewTemplates();

const AI_PICK_COUNT = 10;
let aiPickCache = null;

function aiPickIds() {
  if (aiPickCache) return aiPickCache;
  if (!Array.isArray(NORTHLINE_CATALOG) || NORTHLINE_CATALOG.length === 0) {
    if (aiReviewTemplates && Array.isArray(aiReviewTemplates.recommended)) {
      aiPickCache = new Set(aiReviewTemplates.recommended.map(Number));
    } else {
      aiPickCache = new Set();
    }
    return aiPickCache;
  }
  aiPickCache = new Set(
    NORTHLINE_CATALOG
      .slice()
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, AI_PICK_COUNT)
      .map((p) => Number(p.id))
  );
  return aiPickCache;
}

function aiReviewsForProduct(productId) {
  const tpl = aiReviewTemplates;
  if (!tpl || !tpl.generatedAt) return [];
  const product = NORTHLINE_CATALOG.find(
    (p) => p.id === Number(productId) || p.id === parseInt(productId) || String(p.id) === String(productId),
  );
  if (!product) return [];
  const isKids = product.sizesChildren && product.sizesChildren.length;
  if (
    isKids &&
    Array.isArray(tpl.stores.kids) &&
    tpl.stores.kids.length
  ) {
    return tpl.stores.kids.slice(0, 2);
  }
  const cats = getCategories(product);
  let list = null;
  for (const cat of cats) {
    if (Array.isArray(tpl.stores[cat]) && tpl.stores[cat].length) {
      list = tpl.stores[cat];
      break;
    }
  }
  if (!list) {
    list = tpl.stores.default || [];
  }
  return Array.isArray(list) ? list.slice(0, 2) : [];
}

router.get("/ai-reviews", (req, res) => {
  res.json({
    success: true,
    generatedAt: aiReviewTemplates.generatedAt || 0,
    recommended: aiReviewTemplates.recommended || [],
    stores: Object.keys(aiReviewTemplates.stores || {}),
  });
});

router.post("/ai-reviews/generate", async (req, res) => {
  try {
    if (req.query.key !== AI_GEN_KEY) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized: key salah" });
    }
    if (aiReviewTemplates.generatedAt && req.query.force !== "1") {
      return res.status(409).json({
        success: false,
        message:
          "Template AI sudah di-generate. Gunakan ?force=1 untuk generate ulang (memakai token lagi).",
        generatedAt: aiReviewTemplates.generatedAt,
      });
    }

    const lines = NORTHLINE_CATALOG.map((p) => {
      const cats = getCategories(p).join("/") || "default";
      const kids = p.sizesChildren && p.sizesChildren.length ? "/kids" : "";
      return [
        p.id,
        p.name,
        `kategori:${cats}${kids}`,
        `warna:${(p.colors || []).join("/")}`,
        `harga:${p.priceShort || p.price}${p.oldPrice ? "|old:" + p.oldPrice : ""}`,
        `modelStyle:${(p.modelStyle || []).join("/") || "-"}`,
        `stock:${p.stock || "-"}`,
      ].join("|");
    }).join("\n");

    const prompt = `Analisis data katalog brand fashion Northline berikut (format: id|nama|kategori|warna|harga|modelStyle|stock):\n\n${lines}\n\nInstruksi:\n1. Bandingkan SEMUA produk, lalu pilih 3 id TERBAIK untuk direkomendasikan AI (pertimbangkan desain, nilai harga, kesan premium, non-kids).\n2. Buat template review konsumen realistis per kategori yang relevan: shortsleeve, longsleeve, hoodie, workshirt, kids, default. Tiap kategori maksimal 2 review.\n3. Username: nama orang Indonesia (variasi). Rating: 4 atau 5. Teks: 1-2 kalimat, bahasa Indonesia natural, PUJI bahan/kualitas/boxy/kenyamanan sesuai kategori (shortsleeve=kaos, hoodie=hoodie, dll), TANPA emoji, TANPA hashtag.\n4. Kategori yang tidak mewakili produk apa pun: isi [] (default WAJIB diisi 2 review, kids WAJIB diisi bila ada ukuran anak).\n\nJAWAB HANYA SATU JSON VALID (tanpa markdown, tanpa teks lain):\n{"recommended":[3 id terbaik],"stores":{"shortsleeve":[{"username":"...","rating":5,"text":"..."},{"username":"...","rating":4,"text":"..."}],"longsleeve":[...],"hoodie":[...],"workshirt":[...],"kids":[...],"default":[...]}}`;

    const [models] = await db.execute(
      "SELECT model_id FROM ai_models WHERE provider='copilot' AND enabled=1 ORDER BY is_active DESC, id ASC LIMIT 1",
    );
    if (models.length === 0) {
      throw new Error("Belum ada model GitHub Copilot aktif. Sinkronkan model Copilot dari halaman admin.");
    }
    const raw = await sendCopilotPrompt({
      model: models[0].model_id,
      prompt,
      systemPrompt:
        "Kamu asisten analis data e-commerce. Sampaikan JSON valid saja, tanpa kata pengantar.",
      timeout: 180000,
    });
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
    const plain = raw.match(/\{[\s\S]*\}/);
    const jsonText = (fenced ? fenced[1] : plain ? plain[0] : "").trim();
    if (!jsonText) throw new Error("AI tidak mengembalikan JSON");
    const parsed = JSON.parse(jsonText);
    if (!parsed.stores || !Array.isArray(parsed.recommended)) {
      throw new Error("Format JSON hasil AI tidak sesuai");
    }

    aiReviewTemplates.generatedAt = Date.now();
    aiReviewTemplates.recommended = parsed.recommended
      .slice(0, 5)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    aiReviewTemplates.stores = parsed.stores;
    aiReviewTemplates.catalogIds = NORTHLINE_CATALOG.map((p) => p.id);
    saveAiReviewTemplates(aiReviewTemplates);

    setTimeout(() => invalidateByPrefix("catalog:").catch?.(() => {}), 0);
    res.json({
      success: true,
      generatedAt: aiReviewTemplates.generatedAt,
      recommended: aiReviewTemplates.recommended,
      stores: Object.keys(aiReviewTemplates.stores),
    });
  } catch (err) {
    console.error("AI reviews generate error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Gagal generate template AI review",
    });
  }
});

module.exports = {
  router,
  NORTHLINE_CATALOG,
  getProductCode,
  aiPickIds,
  findCatalogProduct,
  computeUnitPrice,
  computeUnitPriceWithFlash,
  SIZE_EXTRA,
  withCode,
  getCategories,
  dummyReviewMeta,
  mergeRealReviews,
  AI_PICK_COUNT,
};
