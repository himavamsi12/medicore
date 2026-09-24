import type { Address, Gender } from "@/types";
import type { Rng } from "./random";

export const MALE_FIRST = [
  "Aarav", "Vihaan", "Arjun", "Rohan", "Karthik", "Siddharth", "Aditya", "Pranav", "Rahul", "Vikram",
  "Suresh", "Ramesh", "Mahesh", "Venkatesh", "Srinivas", "Prakash", "Anil", "Sunil", "Rajesh", "Manoj",
  "Harish", "Naveen", "Girish", "Deepak", "Abhishek", "Nikhil", "Varun", "Tejas", "Yash", "Omkar",
  "Imran", "Farhan", "Sameer", "Aamir", "Joseph", "Thomas", "Anthony", "Gurpreet", "Harpreet", "Manjunath",
  "Basavaraj", "Chandrashekar", "Lokesh", "Shivakumar", "Raghavendra", "Mohan", "Gopal", "Krishna", "Sanjay", "Ashok",
  "Dinesh", "Ganesh", "Kiran", "Vinay", "Arvind", "Balaji", "Senthil", "Murugan", "Arun", "Vijay",
] as const;

export const FEMALE_FIRST = [
  "Ananya", "Diya", "Aadhya", "Ishita", "Kavya", "Meera", "Priya", "Sneha", "Pooja", "Divya",
  "Lakshmi", "Saraswati", "Geetha", "Shobha", "Radha", "Sunitha", "Vidya", "Kavitha", "Asha", "Usha",
  "Deepika", "Nandini", "Shruti", "Aishwarya", "Bhavana", "Chaitra", "Rashmi", "Rekha", "Savitha", "Tejaswini",
  "Fathima", "Ayesha", "Zainab", "Nazia", "Mary", "Grace", "Jyoti", "Harleen", "Simran", "Manpreet",
  "Pavithra", "Sowmya", "Hema", "Latha", "Padma", "Vasanthi", "Anitha", "Revathi", "Malini", "Sangeetha",
  "Neha", "Riya", "Tanvi", "Aparna", "Sushma", "Nirmala", "Bharathi", "Keerthi", "Swathi", "Roopa",
] as const;

export const SURNAMES = [
  "Sharma", "Iyer", "Reddy", "Nair", "Patel", "Banerjee", "Singh", "Khan", "D'Souza", "Kulkarni",
  "Menon", "Rao", "Gupta", "Das", "Mukherjee", "Pillai", "Chauhan", "Joshi", "Deshpande", "Shaikh",
  "Fernandes", "Bhat", "Hegde", "Naidu", "Yadav", "Verma", "Agarwal", "Chatterjee", "Ghosh", "Saxena",
  "Mishra", "Pandey", "Gowda", "Shetty", "Kamath", "Acharya", "Krishnan", "Subramanian", "Rajan", "Varghese",
  "Kurian", "Mathew", "Qureshi", "Ansari", "Siddiqui", "Grewal", "Sandhu", "Bose", "Sen", "Mehta",
  "Shah", "Desai", "Jain", "Kapoor", "Malhotra", "Srinivasan", "Venkataraman", "Murthy", "Prasad", "Kumar",
] as const;

export const LOCALITIES: Omit<Address, "line1" | "line2">[] = [
  { city: "Bengaluru", state: "Karnataka", pincode: "560076" }, // Bannerghatta Rd
  { city: "Bengaluru", state: "Karnataka", pincode: "560041" }, // Jayanagar
  { city: "Bengaluru", state: "Karnataka", pincode: "560034" }, // Koramangala
  { city: "Bengaluru", state: "Karnataka", pincode: "560068" }, // Bommanahalli
  { city: "Bengaluru", state: "Karnataka", pincode: "560078" }, // JP Nagar
  { city: "Bengaluru", state: "Karnataka", pincode: "560102" }, // HSR Layout
  { city: "Bengaluru", state: "Karnataka", pincode: "560011" }, // Jayanagar East
  { city: "Bengaluru", state: "Karnataka", pincode: "560070" }, // Banashankari
  { city: "Bengaluru", state: "Karnataka", pincode: "560100" }, // Electronic City
  { city: "Bengaluru", state: "Karnataka", pincode: "560037" }, // Marathahalli
  { city: "Mysuru", state: "Karnataka", pincode: "570017" },
  { city: "Tumakuru", state: "Karnataka", pincode: "572102" },
  { city: "Hosur", state: "Tamil Nadu", pincode: "635109" },
  { city: "Mandya", state: "Karnataka", pincode: "571401" },
  { city: "Anantapur", state: "Andhra Pradesh", pincode: "515001" },
  { city: "Kolar", state: "Karnataka", pincode: "563101" },
];

const STREETS = [
  "4th Cross, BTM 2nd Stage", "17th Main, Jayanagar 4th Block", "80 Feet Road, Koramangala 6th Block",
  "Hongasandra Main Road", "24th Main, JP Nagar 6th Phase", "27th Main, HSR Layout Sector 2",
  "10th A Main, Jayanagar 1st Block", "Outer Ring Road, Banashankari 3rd Stage", "Neeladri Road, Electronic City Phase 1",
  "Munnekollal Main Road", "Kuvempu Nagar", "SIT Extension", "Rayakottai Road", "Ashok Nagar", "Sainagar", "Gandhi Nagar",
];

const LANGUAGES = ["Kannada", "English", "Hindi", "Tamil", "Telugu", "Malayalam", "Urdu", "Marathi", "Bengali"] as const;

const OCCUPATIONS = [
  "Software engineer", "Teacher", "Homemaker", "Retired", "Business owner", "Farmer", "Driver", "Student",
  "Bank officer", "Nurse", "Accountant", "Electrician", "Govt. employee", "Shopkeeper", "Security guard", "Chef",
] as const;

export function personName(rng: Rng, gender: Gender) {
  const firstName = gender === "Female" ? rng.pick(FEMALE_FIRST) : rng.pick(MALE_FIRST);
  const lastName = rng.pick(SURNAMES);
  return { firstName, lastName, fullName: `${firstName} ${lastName}` };
}

/** +91 mobile with a realistic leading digit (6-9). */
export function indianMobile(rng: Rng): string {
  const first = rng.pick(["6", "7", "8", "9", "9", "9", "8"]);
  const rest = rng.digits(9);
  const n = first + rest;
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

/** ABHA number: 14 digits, displayed as 91-XXXX-XXXX-XXXX. */
export function abhaNumber(rng: Rng): string {
  const d = rng.digits(12);
  return `91-${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}`;
}

export function abhaAddress(firstName: string, lastName: string, rng: Rng): string {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}${rng.int(1, 99)}@abdm`;
}

export function address(rng: Rng): Address {
  const loc = rng.pick(LOCALITIES);
  return {
    line1: `#${rng.int(1, 480)}, ${rng.pick(STREETS)}`,
    city: loc.city,
    state: loc.state,
    pincode: loc.pincode,
  };
}

export function language(rng: Rng): string {
  return rng.weighted([
    [LANGUAGES[0], 34], [LANGUAGES[1], 20], [LANGUAGES[2], 12], [LANGUAGES[3], 10], [LANGUAGES[4], 10],
    [LANGUAGES[5], 6], [LANGUAGES[6], 4], [LANGUAGES[7], 2], [LANGUAGES[8], 2],
  ]);
}

export function occupation(rng: Rng): string {
  return rng.pick(OCCUPATIONS);
}

export function gstin(rng: Rng, stateCode = "29"): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const L = () => letters[rng.int(0, letters.length - 1)];
  return `${stateCode}${L()}${L()}${L()}${L()}${L()}${rng.digits(4)}${L()}1Z${rng.int(1, 9)}`;
}
