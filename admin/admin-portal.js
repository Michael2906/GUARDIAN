// GUARDIAN Admin Portal JavaScript

// Configuration
const API_BASE_URL = "http://localhost:3000/api";
let currentCustomers = [];
let customPricingClients = [];

// Initialize the portal when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeSidebar();
  loadDashboardData();
  loadCustomers();
  loadCustomPricingOverview();
});

// Sidebar functionality
function initializeSidebar() {
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", function () {
      sidebar.classList.toggle("-translate-x-full");
    });
  }
}

// Navigation between sections
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll(".section").forEach((section) => {
    section.classList.add("hidden");
  });

  // Show selected section
  document.getElementById(sectionName + "-section").classList.remove("hidden");

  // Update title
  const titles = {
    "dashboard": "Dashboard",
    "customers": "Customer Management",
    "pricing": "Custom Pricing",
    "analytics": "Business Analytics",
    "platform": "Platform Settings",
  };
  document.getElementById("section-title").textContent = titles[sectionName];

  // Update active nav link
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.remove("border-r-4", "border-blue-400", "text-white");
    link.classList.add("text-blue-200");
  });

  event.target.classList.remove("text-blue-200");
  event.target.classList.add("text-white", "border-r-4", "border-blue-400");
}

// Dashboard Functions
async function loadDashboardData() {
  try {
    // Load overview statistics
    const response = await fetch(`${API_BASE_URL}/admin/billing/overview`);
    const data = await response.json();

    if (data.success) {
      document.getElementById("custom-plans").textContent =
        data.data.totalCustomPricingClients;
      document.getElementById(
        "monthly-revenue"
      ).textContent = `$${data.data.totalMonthlyRevenue.toLocaleString()}`;
    }

    // Load all customers for total count
    const customersResponse = await fetch(`${API_BASE_URL}/test/models`);
    const customersData = await customersResponse.json();

    if (customersData.success) {
      document.getElementById("total-customers").textContent =
        customersData.stats.companies;
    }

    // For now, set trials to 0 since we don't have that endpoint yet
    document.getElementById("active-trials").textContent = "0";
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

// Customer Management Functions
async function loadCustomers() {
  try {
    // For now, we'll simulate customer data since we don't have a get all customers endpoint
    const tbody = document.getElementById("customers-table-body");

    // Show loading state
    tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="text-gray-500">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p>Loading customers...</p>
                    </div>
                </td>
            </tr>
        `;

    // Check if we have any custom pricing clients to show as examples
    const response = await fetch(`${API_BASE_URL}/admin/billing/overview`);
    const data = await response.json();

    if (data.success && data.data.companies.length > 0) {
      currentCustomers = data.data.companies;
      renderCustomersTable();
      populateCustomerSelects();
    } else {
      tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center">
                        <div class="text-gray-500">
                            <i class="fas fa-users text-4xl mb-4"></i>
                            <p class="text-lg font-medium mb-2">No customers yet</p>
                            <p>Customers will appear here once they register for GUARDIAN</p>
                        </div>
                    </td>
                </tr>
            `;
    }
  } catch (error) {
    console.error("Error loading customers:", error);
    const tbody = document.getElementById("customers-table-body");
    tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center">
                    <div class="text-red-500">
                        <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                        <p>Error loading customers. Please try again.</p>
                    </div>
                </td>
            </tr>
        `;
  }
}

function renderCustomersTable() {
  const tbody = document.getElementById("customers-table-body");

  if (currentCustomers.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    <i class="fas fa-users text-4xl mb-4"></i>
                    <p>No customers found</p>
                </td>
            </tr>
        `;
    return;
  }

  tbody.innerHTML = currentCustomers
    .map((customer) => {
      const statusColor = {
        "trial": "bg-yellow-100 text-yellow-800",
        "active": "bg-green-100 text-green-800",
        "past-due": "bg-red-100 text-red-800",
        "suspended": "bg-gray-100 text-gray-800",
      };

      const planColor = {
        "basic": "bg-blue-100 text-blue-800",
        "pro": "bg-purple-100 text-purple-800",
        "enterprise": "bg-indigo-100 text-indigo-800",
        "custom": "bg-amber-100 text-amber-800",
      };

      return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4">
                    <div>
                        <div class="text-sm font-medium text-gray-900">${
                          customer.name
                        }</div>
                        <div class="text-sm text-gray-500">${
                          customer.email
                        }</div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      planColor[customer.planName] ||
                      "bg-gray-100 text-gray-800"
                    }">
                        ${
                          customer.planName.charAt(0).toUpperCase() +
                          customer.planName.slice(1)
                        }
                    </span>
                </td>
                <td class="px-6 py-4">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      statusColor["active"] || "bg-gray-100 text-gray-800"
                    }">
                        Active
                    </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-900">
                    $${
                      customer.effectiveRate
                        ? customer.effectiveRate.toLocaleString()
                        : customer.standardRate.toLocaleString()
                    }/mo
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                    ${
                      customer.dealInfo?.contractStartDate
                        ? new Date(
                            customer.dealInfo.contractStartDate
                          ).toLocaleDateString()
                        : "N/A"
                    }
                </td>
                <td class="px-6 py-4 text-right text-sm font-medium">
                    <button onclick="viewCustomerDetails('${
                      customer.companyId
                    }')" class="text-blue-600 hover:text-blue-900 mr-3">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="editCustomerPricing('${
                      customer.companyId
                    }')" class="text-green-600 hover:text-green-900 mr-3">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-red-600 hover:text-red-900">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");
}

function refreshCustomers() {
  loadCustomers();
  showNotification("Customers refreshed successfully", "success");
}

// Custom Pricing Functions
async function loadCustomPricingOverview() {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/billing/overview`);
    const data = await response.json();

    if (data.success) {
      customPricingClients = data.data.companies;
      renderCustomPricingList();
    }
  } catch (error) {
    console.error("Error loading custom pricing overview:", error);
  }
}

function renderCustomPricingList() {
  const container = document.getElementById("custom-pricing-list");

  if (customPricingClients.length === 0) {
    container.innerHTML = `
            <div class="text-center text-gray-500">
                <i class="fas fa-tags text-4xl mb-4"></i>
                <p class="text-lg font-medium mb-2">No custom pricing clients</p>
                <p>Custom pricing arrangements will appear here</p>
            </div>
        `;
    return;
  }

  container.innerHTML = customPricingClients
    .map(
      (client) => `
        <div class="border border-gray-200 rounded-lg p-4 mb-4 hover:border-blue-300 transition-colors duration-200">
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="font-semibold text-gray-900">${client.name}</h4>
                    <p class="text-sm text-gray-600">${client.email}</p>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold text-green-600">$${
                      client.effectiveRate
                    }/mo</div>
                    ${
                      client.standardRate !== client.effectiveRate
                        ? `<div class="text-sm text-gray-500 line-through">$${client.standardRate}/mo</div>`
                        : ""
                    }
                </div>
            </div>
            
            ${
              client.dealInfo
                ? `
                <div class="mt-3 pt-3 border-t border-gray-100">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="font-medium text-gray-700">Contract:</span>
                            <span class="text-gray-600">${
                              client.dealInfo.contractLength
                            } months</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Discount:</span>
                            <span class="text-green-600">${
                              client.dealInfo.discountPercentage
                            }%</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Sales Rep:</span>
                            <span class="text-gray-600">${
                              client.dealInfo.salesRep
                            }</span>
                        </div>
                        <div>
                            <span class="font-medium text-gray-700">Payment:</span>
                            <span class="text-gray-600">${
                              client.dealInfo.paymentTerms
                            }</span>
                        </div>
                    </div>
                    ${
                      client.dealInfo.specialTerms
                        ? `
                        <div class="mt-2">
                            <span class="font-medium text-gray-700">Terms:</span>
                            <span class="text-gray-600">${client.dealInfo.specialTerms}</span>
                        </div>
                    `
                        : ""
                    }
                </div>
            `
                : ""
            }
            
            <div class="mt-3 flex justify-end space-x-2">
                <button onclick="viewCustomerDetails('${
                  client.companyId
                }')" class="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                    View Details
                </button>
                <button onclick="editCustomerPricing('${
                  client.companyId
                }')" class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200">
                    Edit Pricing
                </button>
            </div>
        </div>
    `
    )
    .join("");
}

async function populateCustomerSelects() {
  // Populate the customer select dropdown for pricing
  const select = document.getElementById("pricing-customer-select");
  select.innerHTML = '<option value="">Select a customer...</option>';

  currentCustomers.forEach((customer) => {
    const option = document.createElement("option");
    option.value = customer.companyId;
    option.textContent = `${customer.name} (${customer.planName})`;
    select.appendChild(option);
  });
}

async function setCustomPricing() {
  const customerId = document.getElementById("pricing-customer-select").value;
  const monthlyRate = document.getElementById("custom-monthly-rate").value;
  const billingCycle = document.getElementById("billing-cycle").value;
  const reason = document.getElementById("pricing-reason").value;

  if (!customerId || !monthlyRate) {
    showNotification(
      "Please select a customer and enter a monthly rate",
      "error"
    );
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/admin/billing/${customerId}/custom-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customMonthlyRate: parseFloat(monthlyRate),
          customYearlyRate: parseFloat(monthlyRate) * 12,
          billingCycle,
          reason,
          dealInfo: {
            salesRep: "Admin Portal",
            approvedBy: "Michael (Owner)",
          },
        }),
      }
    );

    const data = await response.json();

    if (data.success) {
      showNotification("Custom pricing set successfully!", "success");

      // Clear form
      document.getElementById("pricing-customer-select").value = "";
      document.getElementById("custom-monthly-rate").value = "";
      document.getElementById("pricing-reason").value = "";

      // Refresh data
      loadCustomPricingOverview();
      loadDashboardData();
    } else {
      showNotification(data.error || "Error setting custom pricing", "error");
    }
  } catch (error) {
    console.error("Error setting custom pricing:", error);
    showNotification(
      "Error setting custom pricing. Please try again.",
      "error"
    );
  }
}

async function addBillingAdjustment() {
  const customerId = document.getElementById("pricing-customer-select").value;
  const type = document.getElementById("adjustment-type").value;
  const amount = document.getElementById("adjustment-amount").value;
  const description = document.getElementById("adjustment-description").value;

  if (!customerId || !amount || !description) {
    showNotification(
      "Please fill in all fields for the billing adjustment",
      "error"
    );
    return;
  }

  try {
    let adjustmentAmount = parseFloat(amount);

    // Auto-adjust amount for credits and discounts
    if (type === "credit" || type === "discount") {
      adjustmentAmount = Math.abs(adjustmentAmount) * -1;
    } else if (type === "refund") {
      adjustmentAmount = Math.abs(adjustmentAmount) * -1;
    }

    const response = await fetch(
      `${API_BASE_URL}/admin/billing/${customerId}/adjustments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          amount: adjustmentAmount,
          description,
          reason: `Applied via Admin Portal by Michael (Owner)`,
        }),
      }
    );

    const data = await response.json();

    if (data.success) {
      showNotification(
        `${type.charAt(0).toUpperCase() + type.slice(1)} applied successfully!`,
        "success"
      );

      // Clear form
      document.getElementById("adjustment-amount").value = "";
      document.getElementById("adjustment-description").value = "";

      // Refresh data
      loadCustomPricingOverview();
      loadDashboardData();
    } else {
      showNotification(
        data.error || "Error adding billing adjustment",
        "error"
      );
    }
  } catch (error) {
    console.error("Error adding billing adjustment:", error);
    showNotification(
      "Error adding billing adjustment. Please try again.",
      "error"
    );
  }
}

// Customer Detail Functions
async function viewCustomerDetails(customerId) {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/billing/${customerId}`);
    const data = await response.json();

    if (data.success) {
      showCustomerModal(data.data);
    } else {
      showNotification("Error loading customer details", "error");
    }
  } catch (error) {
    console.error("Error loading customer details:", error);
    showNotification("Error loading customer details", "error");
  }
}

function showCustomerModal(customerData) {
  const modal = document.getElementById("customer-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalContent = document.getElementById("modal-content");

  modalTitle.textContent = `${customerData.company.name} - Details`;

  modalContent.innerHTML = `
        <div class="space-y-6">
            <!-- Company Information -->
            <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 mb-3">Company Information</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">Name:</span>
                        <span class="text-gray-900">${
                          customerData.company.name
                        }</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Email:</span>
                        <span class="text-gray-900">${
                          customerData.company.email
                        }</span>
                    </div>
                </div>
            </div>
            
            <!-- Billing Information -->
            <div class="bg-blue-50 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 mb-3">Billing Information</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">Plan:</span>
                        <span class="text-gray-900">${
                          customerData.billing.planName
                        }</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Status:</span>
                        <span class="px-2 py-1 bg-${
                          customerData.billing.billingStatus === "trial"
                            ? "yellow"
                            : "green"
                        }-100 text-${
    customerData.billing.billingStatus === "trial" ? "yellow" : "green"
  }-800 rounded text-xs">
                            ${customerData.billing.billingStatus}
                        </span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Monthly Rate:</span>
                        <span class="text-green-600 font-semibold">$${
                          customerData.effectiveMonthlyRate
                        }/mo</span>
                    </div>
                    ${
                      customerData.billing.trialEndsAt
                        ? `
                    <div>
                        <span class="font-medium text-gray-700">Trial Ends:</span>
                        <span class="text-orange-600">${new Date(
                          customerData.billing.trialEndsAt
                        ).toLocaleDateString()}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
            </div>
            
            <!-- Custom Pricing Details -->
            ${
              customerData.billing.customPricing?.isCustomPlan
                ? `
                <div class="bg-amber-50 rounded-lg p-4">
                    <h4 class="font-semibold text-gray-900 mb-3">Custom Pricing Details</h4>
                    
                    ${
                      customerData.billing.customPricing.dealInfo
                        ? `
                        <div class="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                                <span class="font-medium text-gray-700">Contract Length:</span>
                                <span class="text-gray-900">${
                                  customerData.billing.customPricing.dealInfo
                                    .contractLength
                                } months</span>
                            </div>
                            <div>
                                <span class="font-medium text-gray-700">Discount:</span>
                                <span class="text-green-600">${
                                  customerData.billing.customPricing.dealInfo
                                    .discountPercentage
                                }%</span>
                            </div>
                            <div>
                                <span class="font-medium text-gray-700">Sales Rep:</span>
                                <span class="text-gray-900">${
                                  customerData.billing.customPricing.dealInfo
                                    .salesRep
                                }</span>
                            </div>
                            <div>
                                <span class="font-medium text-gray-700">Payment Terms:</span>
                                <span class="text-gray-900">${
                                  customerData.billing.customPricing.dealInfo
                                    .paymentTerms
                                }</span>
                            </div>
                        </div>
                        
                        ${
                          customerData.billing.customPricing.dealInfo
                            .specialTerms
                            ? `
                            <div class="text-sm">
                                <span class="font-medium text-gray-700">Special Terms:</span>
                                <p class="text-gray-900 mt-1">${customerData.billing.customPricing.dealInfo.specialTerms}</p>
                            </div>
                        `
                            : ""
                        }
                    `
                        : ""
                    }
                    
                    ${
                      customerData.billing.customPricing.adjustments &&
                      customerData.billing.customPricing.adjustments.length > 0
                        ? `
                        <div class="mt-4">
                            <h5 class="font-medium text-gray-900 mb-2">Billing Adjustments</h5>
                            <div class="space-y-2">
                                ${customerData.billing.customPricing.adjustments
                                  .filter((adj) => adj.isActive)
                                  .map(
                                    (adjustment) => `
                                    <div class="flex justify-between items-center p-2 bg-white rounded border">
                                        <div>
                                            <span class="font-medium">${
                                              adjustment.description
                                            }</span>
                                            <span class="text-xs text-gray-500 block">${
                                              adjustment.type
                                            } - ${new Date(
                                      adjustment.appliedAt
                                    ).toLocaleDateString()}</span>
                                        </div>
                                        <span class="text-${
                                          adjustment.amount < 0
                                            ? "green"
                                            : "red"
                                        }-600 font-semibold">
                                            ${
                                              adjustment.amount < 0 ? "-" : "+"
                                            }$${Math.abs(adjustment.amount)}
                                        </span>
                                    </div>
                                `
                                  )
                                  .join("")}
                            </div>
                        </div>
                    `
                        : ""
                    }
                </div>
            `
                : ""
            }
            
            <!-- Platform Limits -->
            <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-semibold text-gray-900 mb-3">Platform Limits</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="font-medium text-gray-700">Max Warehouses:</span>
                        <span class="text-gray-900">${
                          customerData.limits.maxWarehouses
                        }</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Max Storage:</span>
                        <span class="text-gray-900">${
                          customerData.limits.maxStorageGB
                        }GB</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Max Users:</span>
                        <span class="text-gray-900">${
                          customerData.limits.maxUsersTotal
                        }</span>
                    </div>
                    <div>
                        <span class="font-medium text-gray-700">Max API Calls:</span>
                        <span class="text-gray-900">${customerData.limits.maxAPICallsPerMonth?.toLocaleString()}/month</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="mt-6 flex justify-end space-x-3">
            <button onclick="closeCustomerModal()" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Close
            </button>
            <button onclick="editCustomerPricing('${
              customerData.company.id
            }')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Edit Pricing
            </button>
        </div>
    `;

  modal.classList.remove("hidden");
}

function closeCustomerModal() {
  document.getElementById("customer-modal").classList.add("hidden");
}

function editCustomerPricing(customerId) {
  closeCustomerModal();
  showSection("pricing");

  // Pre-select the customer in the pricing form
  document.getElementById("pricing-customer-select").value = customerId;
}

// Utility Functions
function showNotification(message, type = "info") {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-yellow-500",
    info: "bg-blue-500",
  };

  const notification = document.createElement("div");
  notification.className = `fixed top-4 right-4 z-50 px-6 py-3 ${colors[type]} text-white rounded-lg shadow-lg transform transition-transform duration-300 translate-x-full`;
  notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${
              type === "success"
                ? "check"
                : type === "error"
                ? "exclamation-triangle"
                : "info"
            }-circle mr-2"></i>
            <span>${message}</span>
        </div>
    `;

  document.body.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.classList.remove("translate-x-full");
  }, 100);

  // Animate out and remove
  setTimeout(() => {
    notification.classList.add("translate-x-full");
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}
