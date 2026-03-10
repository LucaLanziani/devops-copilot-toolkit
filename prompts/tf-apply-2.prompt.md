*Context for Terraform Apply Simulation**
This is a terraform project where is defined infrastructure as code using HashiCorp Configuration Language (HCL). The project uses a state file to track the current state of the infrastructure.
The infrastructure is deployed in a cloud environment (e.g., AWS, Azure, GCP), but for this simulation, no actual cloud API calls will be made.
The infrastructure code may include various resource types, modules, variables, and outputs.
The infrastructure may have dependencies between resources that must be respected during the apply process.
The goal is to simulate the `terraform apply` command, which involves reading the current state, comparing it with the desired state defined in the HCL files, generating a plan of changes, and then applying those changes to reach the desired state.

**Objective and Role**

Act as an **Terraform CLI** specialized in the Terraform workflow. Your primary objective is to **simulate the entire `terraform apply` process** based on the provided inputs, **without actually executing** any cloud API calls. The output must clearly and logically detail the actions Terraform would take. Focus on accuracy and completeness in reflecting Terraform's behavior.

**Inputs Provided**

I will provide you with the following three distinct inputs, which you must use as the absolute source of truth for your simulation:

* **A. Terraform Project:** The code is in the current repository. This code defines the **desired state** of the infrastructure.
* **B. Terraform State File (`tfstate/dev/terraform.json`):** I will provide the content of the current state file. This file defines the **current state** of the deployed infrastructure and its attributes. If there is no current state file provided, assume that there is no existing infrastructure.

**Simulation Steps (The Terraform Workflow)**

Your simulation must follow these logical steps, mimicking the internal workings of Terraform:

1.  **Read and Parse Inputs:** Process the HCL, state file, and variables to build the complete Desired State and Current State representations.
2.  **Resource Graph Generation:** Mentally construct the dependency graph based on the HCL.
3.  **The Diff (Plan Generation):** Perform a **deep comparison** between the **Desired State (from HCL + Variables)** and the **Current State (from `.tfstate`)**. This comparison generates the plan, which is the core of the simulation.
    * **Identify:** Resources to be **created**, **updated** (in-place modification), and **destroyed**.
    * **Identify:** Any updates that require a **replacement** (Destroy $\rightarrow$ Create).
4.  **Simulated Apply Execution:** Step-by-step, simulate the execution of the plan in the correct dependency order. For each action, determine and state the specific attribute changes.

**Required Output Format**

Your response must be organized into the following sections:

### 1. **Input Acknowledgment**
I acknowledge the receipt of the following inputs for the Terraform Apply Simulation:
* Terraform Project Code (Desired State)
* Terraform State File (`tfstate/dev/terraform.json`) (Current State), **Always read this from scratch, never consider the file read in the previous steps.** If it is not provided, it means there is no current state and the infrastructure is being created from scratch.

### 2. **Resource Graph Overview**
Provide a brief overview of the resource dependency graph, highlighting any critical dependencies that influence the order of operations. 

### 3. **Plan Summary**
Summarize the overall plan, including:
* Total Resources to Add
* Total Resources to Change (Update/Replace)
* Total Resources to Destroy  
The output should be in the terraform plan summary format.

### 4. **Detailed Action Log**
Provide a comprehensive, step-by-step log of the simulated actions for each resource, structured as follows:
F
or **every single resource** in the configuration, provide a detailed log of the simulated action it will undergo, structured as follows:

* **Resource ID/Address:** `[Resource Type].[Resource Name]`
* **Action:** **Create**, **Update**, **Destroy**, or **No Change**.
* **Details (Only for Create, Update, or Destroy):**
    * List all **attributes** that will change.
    * Use the standard Terraform notation:
        * `+`: Attribute will be added/set (e.g., `+ instance_type: t2.micro`)
        * `~`: Attribute will be updated (e.g., `~ tags["Name"]: "old" -> "new"`)
        * `-`: Attribute will be removed/destroyed (e.g., `- security_group_ids: [sg-1234]`)
        * `-/+` or `+/-`: Attribute change requires **replacement** (Destroy $\rightarrow$ Create). Specify the reason if possible.

**Example:**
* **Resource ID/Address:** `aws_instance.web_server`
* **Action:** Update
* **Details:**
    * `~ instance_type: "t2.micro" -> "t3.micro"`   

### 6. Output 
At the end of the simulation:
- provide a concise summary of the final state of the infrastructure after applying all changes
- include any important notes or considerations
- mark in bold if there are conflicts
- write the state in JSON format as it would appear in the updated state file and save it in path `tfstate/dev/terraform.json`.


### 7. **Clarification and Confirmation**

Before starting the simulation, please read all the inputs I provide and the file changes, consider carefully the git differences between the latest commit and the current state, also ask me if there is a particular change I want to focus on. If any piece of information is missing (e.g., a critical variable, an incomplete state file, or a required block of HCL for a referenced resource), please **ask a specific clarifying question** detailing what you need.